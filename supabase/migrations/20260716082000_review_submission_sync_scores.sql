-- Review a submission and sync its score to score_entries for the submitter/group.

begin;

create or replace function public.review_submission_and_sync_scores(
  p_submission_id uuid,
  p_status text,
  p_raw_score numeric,
  p_raw_max numeric,
  p_final_max numeric
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
  v_assignment_id uuid;
  v_score_raw_max numeric;
  v_score_final_max numeric;
  v_bounded_raw_score numeric;
  v_submission_final_score numeric;
  v_score_final_score numeric;
  v_member_codes text[];
  v_target_count integer;
begin
  if not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  if p_status not in ('ยังไม่ส่ง', 'ส่งแล้ว', 'รอตรวจ', 'ตรวจแล้ว', 'ให้แก้ไข', 'ส่งช้า') then
    raise exception 'INVALID_SUBMISSION_STATUS' using errcode = '22023';
  end if;
  if p_raw_max is null or p_raw_max <= 0 or p_final_max is null or p_final_max <= 0 then
    raise exception 'INVALID_SCORE_MAX' using errcode = '22023';
  end if;

  select * into v_submission
  from public.submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'SUBMISSION_NOT_FOUND' using errcode = '22023';
  end if;

  if v_submission.assignment_id is not null then
    select * into v_assignment
    from public.score_assignments
    where id = v_submission.assignment_id;
  end if;

  if v_assignment.id is null then
    select * into v_assignment
    from public.score_assignments
    where title = v_submission.assignment_title
      and (
        v_submission.classroom_id is null
        or classroom_id = v_submission.classroom_id
      )
    order by case when classroom_id = v_submission.classroom_id then 0 else 1 end, created_at desc
    limit 1;
  end if;

  if v_assignment.id is null then
    raise exception 'ASSIGNMENT_NOT_FOUND_FOR_SUBMISSION' using errcode = '22023';
  end if;

  v_assignment_id := v_assignment.id;
  v_score_raw_max := coalesce(v_assignment.raw_max, p_raw_max);
  v_score_final_max := coalesce(v_assignment.final_max, p_final_max);
  v_bounded_raw_score := greatest(0, least(coalesce(p_raw_score, 0), p_raw_max));
  v_submission_final_score := greatest(0, least(p_final_max, round((v_bounded_raw_score / p_raw_max) * p_final_max)));
  v_score_final_score := greatest(0, least(v_score_final_max, round((least(v_bounded_raw_score, v_score_raw_max) / v_score_raw_max) * v_score_final_max)));
  v_member_codes := coalesce(nullif(v_submission.group_member_codes, array[]::text[]), array[v_submission.student_code]);

  update public.submissions
  set
    assignment_id = v_assignment_id,
    status = p_status,
    raw_score = v_bounded_raw_score,
    raw_max = p_raw_max,
    final_score = v_submission_final_score,
    final_max = p_final_max
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
      updated_at
    )
    select
      v_assignment_id,
      target_students.id,
      target_students.student_code,
      'scored',
      least(v_bounded_raw_score, v_score_raw_max),
      v_score_raw_max,
      v_score_final_score,
      v_score_final_max,
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
      updated_at = now()
    returning 1
  )
  select count(*) into v_target_count from upserted;

  if coalesce(v_target_count, 0) = 0 then
    raise exception 'STUDENT_NOT_FOUND_FOR_SCORE' using errcode = '22023';
  end if;

  return v_updated;
end;
$$;

revoke all on function public.review_submission_and_sync_scores(uuid, text, numeric, numeric, numeric) from public, anon;
grant execute on function public.review_submission_and_sync_scores(uuid, text, numeric, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';

commit;
