-- Append-only submission and review history for teacher and student profiles.

begin;

lock table public.submissions in share row exclusive mode;

create table if not exists public.submission_history (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  assignment_id uuid,
  classroom_id uuid,
  assignment_title text not null default '',
  classroom_name text not null default '',
  student_code text not null default '',
  student_name text not null default '',
  submission_kind text not null default 'individual' check (submission_kind in ('individual', 'group')),
  group_member_codes text[] not null default '{}',
  group_member_names text[] not null default '{}',
  event_type text not null check (event_type in (
    'baseline', 'submitted', 'reviewed', 'score_changed',
    'status_changed', 'attachment_removed', 'deleted'
  )),
  before_state jsonb,
  after_state jsonb,
  attachment_name text not null default '',
  actor_id uuid,
  actor_name text not null default '',
  actor_type text not null check (actor_type in ('teacher', 'student', 'system', 'baseline')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  occurred_at timestamptz not null default clock_timestamp()
);

-- History intentionally has no foreign keys so later cleanup cannot erase it.
create index if not exists submission_history_room_time_idx
  on public.submission_history (classroom_id, occurred_at desc, id desc);
create index if not exists submission_history_student_time_idx
  on public.submission_history (student_code, occurred_at desc, id desc);
create index if not exists submission_history_submission_time_idx
  on public.submission_history (submission_id, occurred_at desc, id desc);
create index if not exists submission_history_group_codes_idx
  on public.submission_history using gin (group_member_codes);
create unique index if not exists submission_history_baseline_idx
  on public.submission_history (submission_id) where event_type = 'baseline';

alter table public.submission_history enable row level security;
drop policy if exists "submission history own group or teacher" on public.submission_history;
create policy "submission history own group or teacher" on public.submission_history
for select to authenticated using (
  public.is_teacher()
  or student_code = public.current_student_code()
  or public.current_student_code() = any(group_member_codes)
);

revoke all on public.submission_history from public, anon, authenticated, service_role;
grant select on public.submission_history to authenticated, service_role;

create or replace function public.submission_history_snapshot(value public.submissions)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'status', value.status,
    'raw_score', value.raw_score,
    'raw_max', value.raw_max,
    'final_score', value.final_score,
    'final_max', value.final_max,
    'attachment_type', case
      when value.file_path is not null then 'file'
      when value.link_url is not null then 'link'
      else 'none'
    end,
    'file_deleted', value.file_deleted_at is not null
  );
$$;

create or replace function public.record_submission_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_submission public.submissions%rowtype;
  v_event_type text;
  v_before jsonb;
  v_after jsonb;
  v_classroom_name text;
  v_actor_name text;
  v_actor_role text;
begin
  if tg_op = 'INSERT' then
    v_submission := new;
    v_event_type := 'submitted';
    v_after := public.submission_history_snapshot(new);
  elsif tg_op = 'DELETE' then
    v_submission := old;
    v_event_type := 'deleted';
    v_before := public.submission_history_snapshot(old);
  else
    v_submission := new;
    v_before := public.submission_history_snapshot(old);
    v_after := public.submission_history_snapshot(new);

    if new.status = 'ตรวจแล้ว' and old.status is distinct from new.status then
      v_event_type := 'reviewed';
    elsif (old.raw_score, old.raw_max, old.final_score, old.final_max)
      is distinct from (new.raw_score, new.raw_max, new.final_score, new.final_max) then
      v_event_type := 'score_changed';
    elsif old.file_path is not null and new.file_path is null and new.file_deleted_at is not null then
      v_event_type := 'attachment_removed';
    elsif old.status is distinct from new.status then
      v_event_type := 'status_changed';
    else
      return new;
    end if;
  end if;

  select display_name into v_classroom_name
  from public.classrooms where id = v_submission.classroom_id;
  select full_name, role into v_actor_name, v_actor_role
  from public.profiles where id = auth.uid();

  insert into public.submission_history (
    submission_id, assignment_id, classroom_id, assignment_title, classroom_name,
    student_code, student_name, submission_kind, group_member_codes, group_member_names,
    event_type, before_state, after_state, attachment_name,
    actor_id, actor_name, actor_type, submitted_at, reviewed_at
  ) values (
    v_submission.id, v_submission.assignment_id, v_submission.classroom_id,
    coalesce(v_submission.assignment_title, ''), coalesce(v_classroom_name, ''),
    coalesce(v_submission.student_code, ''), coalesce(v_submission.student_name, ''),
    coalesce(v_submission.submission_kind, 'individual'),
    coalesce(v_submission.group_member_codes, array[]::text[]),
    coalesce(v_submission.group_member_names, array[]::text[]),
    v_event_type, v_before, v_after,
    coalesce(v_submission.original_file_name, ''),
    auth.uid(), coalesce(v_actor_name, ''),
    case
      when auth.uid() is null then 'system'
      when v_actor_role = 'teacher' then 'teacher'
      else 'student'
    end,
    v_submission.submitted_at, v_submission.reviewed_at
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.submission_history_snapshot(public.submissions) from public, anon, authenticated, service_role;
revoke all on function public.record_submission_history() from public, anon, authenticated, service_role;

-- Current rows become honest baselines; no past events are fabricated.
insert into public.submission_history (
  submission_id, assignment_id, classroom_id, assignment_title, classroom_name,
  student_code, student_name, submission_kind, group_member_codes, group_member_names,
  event_type, after_state, attachment_name, actor_name, actor_type,
  submitted_at, reviewed_at, occurred_at
)
select
  submission.id, submission.assignment_id, submission.classroom_id,
  coalesce(submission.assignment_title, ''), coalesce(classroom.display_name, ''),
  coalesce(submission.student_code, ''), coalesce(submission.student_name, ''),
  coalesce(submission.submission_kind, 'individual'),
  coalesce(submission.group_member_codes, array[]::text[]),
  coalesce(submission.group_member_names, array[]::text[]),
  case when submission.status = 'ตรวจแล้ว' then 'reviewed' else 'baseline' end,
  public.submission_history_snapshot(submission),
  coalesce(submission.original_file_name, ''), '', 'baseline',
  submission.submitted_at, submission.reviewed_at,
  coalesce(submission.reviewed_at, submission.submitted_at, clock_timestamp())
from public.submissions submission
left join public.classrooms classroom on classroom.id = submission.classroom_id
where not exists (
  select 1 from public.submission_history history
  where history.submission_id = submission.id
)
on conflict (submission_id) where event_type = 'baseline' do nothing;

drop trigger if exists submissions_record_history on public.submissions;
create trigger submissions_record_history
after insert or update or delete on public.submissions
for each row execute function public.record_submission_history();

comment on table public.submission_history is
  'Append-only submission audit visible to teachers and the related student/group members.';

notify pgrst, 'reload schema';

commit;
