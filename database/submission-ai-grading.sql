-- Run this focused patch in the Supabase SQL editor.
-- It adds automatic AI grading for regular file/link submissions.

create table if not exists public.submission_ai_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.submissions (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  suggested_raw_score numeric not null default 0 check (suggested_raw_score >= 0),
  confidence numeric not null default 0 check (confidence between 0 and 1),
  feedback text not null default '',
  model text not null default '',
  error_message text not null default '',
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint submission_ai_reviews_feedback_length check (char_length(feedback) <= 4000),
  constraint submission_ai_reviews_error_length check (char_length(error_message) <= 1000)
);

create index if not exists submission_ai_reviews_status_requested_idx
  on public.submission_ai_reviews (status, requested_at desc);

alter table public.submission_ai_reviews enable row level security;

drop policy if exists "submission ai reviews select own or teacher" on public.submission_ai_reviews;
create policy "submission ai reviews select own or teacher" on public.submission_ai_reviews
for select to authenticated using (
  public.is_teacher()
  or exists (
    select 1
    from public.submissions submission
    where submission.id = submission_ai_reviews.submission_id
      and (
        submission.student_code = public.current_student_code()
        or public.current_student_code() = any(submission.group_member_codes)
      )
  )
);

create or replace function public.apply_submission_ai_grade(
  p_submission_id uuid,
  p_raw_score numeric,
  p_confidence numeric,
  p_feedback text,
  p_model text
)
returns public.submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_submission public.submissions%rowtype;
  v_updated public.submissions%rowtype;
  v_assignment public.score_assignments%rowtype;
  v_bounded_raw_score numeric;
  v_final_score numeric;
  v_member_codes text[];
  v_target_count integer;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
    and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;

  if p_confidence is null or p_confidence < 0 or p_confidence > 1 then
    raise exception 'INVALID_AI_CONFIDENCE' using errcode = '22023';
  end if;

  select * into v_submission
  from public.submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'SUBMISSION_NOT_FOUND' using errcode = '22023';
  end if;
  if v_submission.status = 'ตรวจแล้ว' then
    raise exception 'SUBMISSION_ALREADY_REVIEWED' using errcode = '22023';
  end if;
  if v_submission.assignment_id is null then
    raise exception 'ASSIGNMENT_NOT_FOUND_FOR_SUBMISSION' using errcode = '22023';
  end if;

  select * into v_assignment
  from public.score_assignments
  where id = v_submission.assignment_id;

  if not found then
    raise exception 'ASSIGNMENT_NOT_FOUND_FOR_SUBMISSION' using errcode = '22023';
  end if;

  v_bounded_raw_score := greatest(0, least(coalesce(p_raw_score, 0), v_assignment.raw_max));
  v_final_score := greatest(
    0,
    least(v_assignment.final_max, round((v_bounded_raw_score / v_assignment.raw_max) * v_assignment.final_max))
  );
  v_member_codes := coalesce(
    nullif(v_submission.group_member_codes, array[]::text[]),
    array[v_submission.student_code]
  );

  update public.submissions
  set
    status = 'ตรวจแล้ว',
    raw_score = v_bounded_raw_score,
    raw_max = v_assignment.raw_max,
    final_score = v_final_score,
    final_max = v_assignment.final_max,
    reviewed_at = now()
  where id = p_submission_id
  returning * into v_updated;

  with target_students as (
    select distinct on (student.student_code)
      student.id,
      student.student_code
    from public.students student
    where student.student_code = any(v_member_codes)
      and (
        v_submission.classroom_id is null
        or student.classroom_id = v_submission.classroom_id
        or not exists (
          select 1
          from public.students exact_student
          where exact_student.student_code = student.student_code
            and exact_student.classroom_id = v_submission.classroom_id
        )
      )
    order by
      student.student_code,
      case when student.classroom_id = v_submission.classroom_id then 0 else 1 end,
      student.student_no nulls last,
      student.id
  ),
  upserted as (
    insert into public.score_entries (
      assignment_id,
      student_id,
      student_code,
      score_status,
      raw_score,
      raw_max,
      final_score,
      final_max,
      source_type,
      source_id,
      updated_at
    )
    select
      v_assignment.id,
      target_students.id,
      target_students.student_code,
      'scored',
      v_bounded_raw_score,
      v_assignment.raw_max,
      v_final_score,
      v_assignment.final_max,
      'submission',
      v_submission.id,
      now()
    from target_students
    on conflict (assignment_id, student_id) do update
    set
      student_code = excluded.student_code,
      score_status = excluded.score_status,
      raw_score = excluded.raw_score,
      raw_max = excluded.raw_max,
      final_score = excluded.final_score,
      final_max = excluded.final_max,
      source_type = excluded.source_type,
      source_id = excluded.source_id,
      updated_at = now()
    returning 1
  )
  select count(*) into v_target_count from upserted;

  if coalesce(v_target_count, 0) = 0 then
    raise exception 'STUDENT_NOT_FOUND_FOR_SCORE' using errcode = '22023';
  end if;

  update public.submission_ai_reviews
  set
    status = 'completed',
    suggested_raw_score = v_bounded_raw_score,
    confidence = p_confidence,
    feedback = left(coalesce(p_feedback, ''), 4000),
    model = left(coalesce(p_model, ''), 200),
    error_message = '',
    completed_at = now(),
    updated_at = now()
  where submission_id = p_submission_id;

  return v_updated;
end;
$$;

revoke all on function public.apply_submission_ai_grade(uuid, numeric, numeric, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_submission_ai_grade(uuid, numeric, numeric, text, text)
  to service_role;
grant select on public.submission_ai_reviews to authenticated;

comment on table public.submission_ai_reviews
is 'Server-generated AI grading status and feedback for regular submissions.';
comment on function public.apply_submission_ai_grade(uuid, numeric, numeric, text, text)
is 'Service-role-only transaction that applies an AI score to a submission and all group members.';

notify pgrst, 'reload schema';
