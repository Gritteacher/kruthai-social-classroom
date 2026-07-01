-- Add secure group submissions with file-or-link delivery.
-- Safe to run more than once in the Supabase SQL editor.

begin;

alter table public.submissions add column if not exists submission_kind text not null default 'individual';
alter table public.submissions add column if not exists link_url text;
alter table public.submissions add column if not exists group_member_codes text[] not null default '{}';
alter table public.submissions add column if not exists group_member_names text[] not null default '{}';

update public.submissions
set group_member_codes = array[student_code],
    group_member_names = array[student_name]
where cardinality(group_member_codes) = 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'submissions_submission_kind_check'
      and conrelid = 'public.submissions'::regclass
  ) then
    alter table public.submissions
      add constraint submissions_submission_kind_check
      check (submission_kind in ('individual', 'group'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'submissions_delivery_check'
      and conrelid = 'public.submissions'::regclass
  ) then
    alter table public.submissions
      add constraint submissions_delivery_check
      check (
        (file_path is not null and link_url is null)
        or (file_path is null and link_url is not null)
      ) not valid;
  end if;
end;
$$;

create index if not exists submissions_group_member_codes_idx
on public.submissions using gin (group_member_codes);

create or replace function public.get_classroom_peers()
returns table (
  id uuid,
  student_no integer,
  student_code text,
  full_name text,
  class_name text,
  classroom_id uuid
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.student_no, s.student_code, s.full_name, s.class_name, s.classroom_id
  from public.students s
  where public.current_student_code() is not null
    and s.classroom_id = public.user_classroom_id()
  order by s.student_no nulls last, s.full_name, s.student_code;
$$;

create or replace function public.submit_assignment_work(
  p_assignment_id uuid,
  p_file_path text default null,
  p_link_url text default null,
  p_member_codes text[] default null
)
returns setof public.submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_code text := public.current_student_code();
  v_student_name text := public.current_student_name();
  v_classroom_id uuid := public.user_classroom_id();
  v_assignment public.score_assignments%rowtype;
  v_member_codes text[];
  v_member_names text[];
  v_file_path text := nullif(trim(coalesce(p_file_path, '')), '');
  v_link_url text := nullif(trim(coalesce(p_link_url, '')), '');
begin
  if auth.uid() is null or v_student_code is null or v_student_name is null or v_classroom_id is null then
    raise exception 'ไม่พบบัญชีนักเรียนหรือห้องเรียน';
  end if;

  select * into v_assignment
  from public.score_assignments
  where id = p_assignment_id
    and classroom_id = v_classroom_id;

  if not found then
    raise exception 'ไม่พบงานในห้องเรียนของนักเรียน';
  end if;

  if (v_file_path is null) = (v_link_url is null) then
    raise exception 'เลือกส่งไฟล์หรือลิงก์เพียงอย่างเดียว';
  end if;

  if v_file_path is not null
    and v_file_path not like 'submissions/' || v_student_code || '/%' then
    raise exception 'ตำแหน่งไฟล์ส่งงานไม่ถูกต้อง';
  end if;

  if v_link_url is not null and v_link_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'ลิงก์งานต้องขึ้นต้นด้วย http:// หรือ https://';
  end if;

  select array_agg(member_code order by first_position)
  into v_member_codes
  from (
    select trim(member_code) as member_code, min(position) as first_position
    from unnest(coalesce(p_member_codes, array[v_student_code])) with ordinality as member(member_code, position)
    where trim(member_code) <> ''
    group by trim(member_code)
  ) normalized;

  v_member_codes := coalesce(v_member_codes, array[v_student_code]);
  if not (v_student_code = any(v_member_codes)) then
    v_member_codes := array_prepend(v_student_code, v_member_codes);
  end if;

  if cardinality(v_member_codes) > 20 then
    raise exception 'งานกลุ่มเลือกสมาชิกได้ไม่เกิน 20 คน';
  end if;

  if (
    select count(*)
    from public.students s
    where s.classroom_id = v_classroom_id
      and s.student_code = any(v_member_codes)
  ) <> cardinality(v_member_codes) then
    raise exception 'สมาชิกทุกคนต้องอยู่ในห้องเรียนเดียวกัน';
  end if;

  select array_agg(s.full_name order by member.position)
  into v_member_names
  from unnest(v_member_codes) with ordinality as member(student_code, position)
  join public.students s
    on s.student_code = member.student_code
   and s.classroom_id = v_classroom_id;

  return query
  insert into public.submissions (
    assignment_id,
    assignment_title,
    student_name,
    student_code,
    classroom_id,
    file_path,
    link_url,
    submission_kind,
    group_member_codes,
    group_member_names,
    status,
    raw_score,
    raw_max,
    final_score,
    final_max
  ) values (
    v_assignment.id,
    v_assignment.title,
    v_student_name,
    v_student_code,
    v_classroom_id,
    v_file_path,
    v_link_url,
    case when cardinality(v_member_codes) > 1 then 'group' else 'individual' end,
    v_member_codes,
    v_member_names,
    'รอตรวจ',
    0,
    v_assignment.raw_max,
    0,
    v_assignment.final_max
  )
  returning *;
end;
$$;

create or replace function public.can_access_submission_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_teacher() or exists (
    select 1
    from public.submissions submission
    where submission.file_path = object_name
      and (
        submission.student_code = public.current_student_code()
        or public.current_student_code() = any(submission.group_member_codes)
      )
  );
$$;

create or replace function public.guard_student_submission_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin')
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or public.is_teacher() then
    return new;
  end if;

  if old.student_code <> public.current_student_code()
    or new.student_code is distinct from old.student_code
    or new.student_name is distinct from old.student_name
    or new.classroom_id is distinct from old.classroom_id
    or new.assignment_id is distinct from old.assignment_id
    or new.assignment_title is distinct from old.assignment_title
    or new.submitted_at is distinct from old.submitted_at
    or new.submission_kind is distinct from old.submission_kind
    or new.group_member_codes is distinct from old.group_member_codes
    or new.group_member_names is distinct from old.group_member_names
    or new.link_url is distinct from old.link_url
    or new.status is distinct from old.status
    or new.raw_score is distinct from old.raw_score
    or new.raw_max is distinct from old.raw_max
    or new.final_score is distinct from old.final_score
    or new.final_max is distinct from old.final_max
    or (
      new.file_path is distinct from old.file_path
      and coalesce(new.file_path, '') not like 'submissions/' || public.current_student_code() || '/%'
    ) then
    raise exception 'นักเรียนแก้ไขข้อมูลการตรวจ คะแนน หรือสมาชิกกลุ่มไม่ได้';
  end if;

  return new;
end;
$$;

drop policy if exists "submissions select own or teacher" on public.submissions;
drop policy if exists "submissions insert own or teacher" on public.submissions;
drop policy if exists "submissions update own or teacher" on public.submissions;
drop policy if exists "submissions delete teacher" on public.submissions;
drop policy if exists "submissions select own group or teacher" on public.submissions;
drop policy if exists "submissions insert teacher" on public.submissions;
drop policy if exists "submissions update submitter or teacher" on public.submissions;

create policy "submissions select own group or teacher" on public.submissions
for select to authenticated
using (
  public.is_teacher()
  or student_code = public.current_student_code()
  or public.current_student_code() = any(group_member_codes)
);
create policy "submissions insert teacher" on public.submissions
for insert to authenticated with check (public.is_teacher());
create policy "submissions update submitter or teacher" on public.submissions
for update to authenticated
using (public.is_teacher() or student_code = public.current_student_code())
with check (public.is_teacher() or student_code = public.current_student_code());
create policy "submissions delete teacher" on public.submissions
for delete to authenticated using (public.is_teacher());

drop policy if exists "classroom files delete teacher" on storage.objects;
drop policy if exists "classroom files delete scoped" on storage.objects;
create policy "classroom files delete scoped" on storage.objects
for delete to authenticated
using (
  bucket_id = 'classroom-files'
  and (
    public.is_teacher()
    or (
      (storage.foldername(name))[1] = 'submissions'
      and (storage.foldername(name))[2] = public.current_student_code()
    )
  )
);

revoke all on function public.get_classroom_peers() from public;
revoke all on function public.submit_assignment_work(uuid, text, text, text[]) from public;
revoke all on function public.can_access_submission_file(text) from public;
revoke all on function public.guard_student_submission_update() from public, authenticated;
grant execute on function public.get_classroom_peers() to authenticated;
grant execute on function public.submit_assignment_work(uuid, text, text, text[]) to authenticated;
grant execute on function public.can_access_submission_file(text) to authenticated;

notify pgrst, 'reload schema';

commit;
