create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('teacher','student')),
  student_code text unique,
  class_name text,
  school_name text default 'โรงเรียนเทพศิรินทร์ นนทบุรี',
  created_at timestamptz not null default now()
);

create table if not exists public.classrooms (
  id uuid primary key default uuid_generate_v4(),
  academic_year text not null,
  level text not null,
  room text not null,
  subject text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (academic_year, level, room, subject)
);

create table if not exists public.materials (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  unit text not null,
  level text not null,
  material_type text not null check (material_type in ('PDF','VIDEO','IMG')),
  class_name text not null default 'ยังไม่ได้เลือกห้องเรียน',
  classroom_id uuid references public.classrooms (id) on delete set null,
  file_path text,
  cover_path text,
  published_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create table if not exists public.students (
  id uuid primary key default uuid_generate_v4(),
  student_no integer,
  student_code text not null unique,
  full_name text not null,
  gender text,
  class_name text not null default 'ยังไม่ได้เลือกห้องเรียน',
  classroom_id uuid references public.classrooms (id) on delete set null,
  auth_email text,
  account_created_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.score_assignments (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  class_name text not null default 'ยังไม่ได้เลือกห้องเรียน',
  classroom_id uuid references public.classrooms (id) on delete set null,
  raw_max numeric not null check (raw_max > 0),
  final_max numeric not null check (final_max > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.score_entries (
  id uuid primary key default uuid_generate_v4(),
  assignment_id uuid not null references public.score_assignments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  student_code text not null,
  raw_score numeric not null default 0 check (raw_score >= 0),
  raw_max numeric not null check (raw_max > 0),
  final_score numeric not null default 0 check (final_score >= 0),
  final_max numeric not null check (final_max > 0),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create table if not exists public.submissions (
  id uuid primary key default uuid_generate_v4(),
  assignment_id uuid references public.score_assignments (id) on delete set null,
  assignment_title text not null,
  student_name text not null,
  student_code text not null,
  classroom_id uuid references public.classrooms (id) on delete set null,
  file_path text,
  status text not null default 'รอตรวจ',
  raw_score numeric not null default 0 check (raw_score >= 0),
  raw_max numeric not null default 10 check (raw_max > 0),
  final_score numeric not null default 0 check (final_score >= 0),
  final_max numeric not null default 10 check (final_max > 0),
  submitted_at timestamptz not null default now()
);

create table if not exists public.scores (
  id uuid primary key default uuid_generate_v4(),
  student_code text not null,
  assessment_title text not null,
  score numeric not null check (score >= 0),
  max_score numeric not null check (max_score > 0),
  passed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (student_code, assessment_title)
);

create table if not exists public.announcements (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text not null,
  class_name text not null default 'ยังไม่ได้เลือกห้องเรียน',
  classroom_id uuid references public.classrooms (id) on delete set null,
  published_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);

create table if not exists public.student_roster_uploads (
  id uuid primary key default uuid_generate_v4(),
  class_name text not null,
  classroom_id uuid references public.classrooms (id) on delete set null,
  file_path text not null,
  file_name text not null,
  file_size integer not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.material_download_logs (
  id uuid primary key default uuid_generate_v4(),
  material_id uuid not null references public.materials (id) on delete cascade,
  material_title text not null,
  student_code text not null,
  student_name text not null,
  class_name text not null default 'ยังไม่ได้เลือกห้องเรียน',
  classroom_id uuid references public.classrooms (id) on delete set null,
  downloaded_at timestamptz not null default now()
);

alter table public.profiles add column if not exists school_name text default 'โรงเรียนเทพศิรินทร์ นนทบุรี';
alter table public.materials add column if not exists class_name text not null default 'ยังไม่ได้เลือกห้องเรียน';
alter table public.materials add column if not exists classroom_id uuid references public.classrooms (id) on delete set null;
alter table public.students add column if not exists classroom_id uuid references public.classrooms (id) on delete set null;
alter table public.students add column if not exists auth_email text;
alter table public.students add column if not exists account_created_at timestamptz;
alter table public.students alter column class_name set default 'ยังไม่ได้เลือกห้องเรียน';
alter table public.score_assignments add column if not exists classroom_id uuid references public.classrooms (id) on delete set null;
alter table public.score_assignments add column if not exists assignment_group_id uuid;
alter table public.score_assignments alter column class_name set default 'ยังไม่ได้เลือกห้องเรียน';
alter table public.submissions add column if not exists assignment_id uuid references public.score_assignments (id) on delete set null;
alter table public.submissions add column if not exists classroom_id uuid references public.classrooms (id) on delete set null;
alter table public.submissions add column if not exists raw_score numeric not null default 0 check (raw_score >= 0);
alter table public.submissions add column if not exists raw_max numeric not null default 10 check (raw_max > 0);
alter table public.submissions add column if not exists final_score numeric not null default 0 check (final_score >= 0);
alter table public.submissions add column if not exists final_max numeric not null default 10 check (final_max > 0);
alter table public.announcements add column if not exists class_name text not null default 'ยังไม่ได้เลือกห้องเรียน';
alter table public.announcements add column if not exists classroom_id uuid references public.classrooms (id) on delete set null;
alter table public.announcements add column if not exists created_by uuid references public.profiles (id);
alter table public.student_roster_uploads add column if not exists classroom_id uuid references public.classrooms (id) on delete set null;
alter table public.material_download_logs add column if not exists class_name text not null default 'ยังไม่ได้เลือกห้องเรียน';
alter table public.material_download_logs add column if not exists classroom_id uuid references public.classrooms (id) on delete set null;

with existing_groups as (
  select distinct on (lower(trim(title)), raw_max, final_max, created_at)
    lower(trim(title)) as title_key,
    raw_max,
    final_max,
    created_at,
    assignment_group_id
  from public.score_assignments
  where assignment_group_id is not null
  order by lower(trim(title)), raw_max, final_max, created_at, id
)
update public.score_assignments assignment
set assignment_group_id = existing_group.assignment_group_id
from existing_groups existing_group
where assignment.assignment_group_id is null
  and lower(trim(assignment.title)) = existing_group.title_key
  and assignment.raw_max = existing_group.raw_max
  and assignment.final_max = existing_group.final_max
  and assignment.created_at = existing_group.created_at;

with new_groups as (
  select
    lower(trim(title)) as title_key,
    raw_max,
    final_max,
    created_at,
    uuid_generate_v4() as assignment_group_id
  from public.score_assignments
  where assignment_group_id is null
  group by lower(trim(title)), raw_max, final_max, created_at
)
update public.score_assignments assignment
set assignment_group_id = new_group.assignment_group_id
from new_groups new_group
where assignment.assignment_group_id is null
  and lower(trim(assignment.title)) = new_group.title_key
  and assignment.raw_max = new_group.raw_max
  and assignment.final_max = new_group.final_max
  and assignment.created_at = new_group.created_at;

with duplicate_groups as (
  select assignment_group_id
  from public.score_assignments
  where assignment_group_id is not null
  group by assignment_group_id
  having count(*) > count(distinct classroom_id)
), split_batches as (
  select
    assignment.assignment_group_id as previous_group_id,
    assignment.created_at,
    uuid_generate_v4() as next_group_id
  from public.score_assignments assignment
  join duplicate_groups duplicate_group using (assignment_group_id)
  group by assignment.assignment_group_id, assignment.created_at
)
update public.score_assignments assignment
set assignment_group_id = split_batch.next_group_id
from split_batches split_batch
where assignment.assignment_group_id = split_batch.previous_group_id
  and assignment.created_at = split_batch.created_at;

alter table public.score_assignments alter column assignment_group_id set default uuid_generate_v4();
alter table public.score_assignments alter column assignment_group_id set not null;
create index if not exists score_assignments_group_id_idx on public.score_assignments (assignment_group_id);

insert into storage.buckets (id, name, public)
values ('classroom-files', 'classroom-files', false)
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.materials enable row level security;
alter table public.classrooms enable row level security;
alter table public.students enable row level security;
alter table public.score_assignments enable row level security;
alter table public.score_entries enable row level security;
alter table public.submissions enable row level security;
alter table public.scores enable row level security;
alter table public.announcements enable row level security;
alter table public.student_roster_uploads enable row level security;
alter table public.material_download_logs enable row level security;

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
  );
$$;

create or replace function public.current_student_code()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif(trim(student_code), '')
  from public.profiles
  where id = auth.uid() and role = 'student'
  limit 1;
$$;

create or replace function public.current_student_name()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.full_name
  from public.students s
  where s.student_code = public.current_student_code()
  limit 1;
$$;

create or replace function public.user_classroom_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.classroom_id
  from public.students s
  where s.student_code = public.current_student_code()
  limit 1;
$$;

create or replace function public.user_classroom_level()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.level
  from public.classrooms c
  where c.id = public.user_classroom_id()
  limit 1;
$$;

create or replace function public.can_access_material_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_teacher() or exists (
    select 1
    from public.materials m
    where m.file_path = object_name
      and (
        m.classroom_id = public.user_classroom_id()
        or (m.classroom_id is null and m.level = public.user_classroom_level())
      )
  );
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
      and submission.student_code = public.current_student_code()
  );
$$;

revoke all on function public.is_teacher() from public;
revoke all on function public.current_student_code() from public;
revoke all on function public.current_student_name() from public;
revoke all on function public.user_classroom_id() from public;
revoke all on function public.user_classroom_level() from public;
revoke all on function public.can_access_material_file(text) from public;
revoke all on function public.can_access_submission_file(text) from public;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.current_student_code() to authenticated;
grant execute on function public.current_student_name() to authenticated;
grant execute on function public.user_classroom_id() to authenticated;
grant execute on function public.user_classroom_level() to authenticated;
grant execute on function public.can_access_material_file(text) to authenticated;
grant execute on function public.can_access_submission_file(text) to authenticated;

create or replace function public.update_score_assignment_group(
  p_assignment_group_id uuid,
  p_classroom_ids uuid[],
  p_title text,
  p_raw_max numeric,
  p_final_max numeric
)
returns setof public.score_assignments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  selected_assignment_ids uuid[];
  selected_classroom_count integer;
  highest_recorded_score numeric;
begin
  if not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  if p_assignment_group_id is null then
    raise exception 'ASSIGNMENT_GROUP_REQUIRED' using errcode = '22023';
  end if;

  if coalesce(cardinality(p_classroom_ids), 0) = 0 or array_position(p_classroom_ids, null) is not null then
    raise exception 'CLASSROOM_REQUIRED' using errcode = '22023';
  end if;

  if nullif(trim(p_title), '') is null then
    raise exception 'TITLE_REQUIRED' using errcode = '22023';
  end if;

  if p_raw_max is null or p_raw_max <= 0 or p_final_max is null or p_final_max <= 0 then
    raise exception 'INVALID_SCORE_MAX' using errcode = '22023';
  end if;

  select count(distinct classroom_id), array_agg(id)
  into selected_classroom_count, selected_assignment_ids
  from public.score_assignments
  where assignment_group_id = p_assignment_group_id
    and classroom_id = any(p_classroom_ids);

  if coalesce(selected_classroom_count, 0) <> (
    select count(distinct selected.classroom_id)
    from unnest(p_classroom_ids) as selected(classroom_id)
  ) then
    raise exception 'ASSIGNMENT_CLASSROOM_NOT_FOUND' using errcode = '22023';
  end if;

  select greatest(
    coalesce((
      select max(raw_score)
      from public.score_entries
      where assignment_id = any(selected_assignment_ids)
    ), 0),
    coalesce((
      select max(raw_score)
      from public.submissions
      where assignment_id = any(selected_assignment_ids)
    ), 0)
  )
  into highest_recorded_score;

  if p_raw_max < highest_recorded_score then
    raise exception 'RAW_MAX_BELOW_RECORDED_SCORE:%', highest_recorded_score using errcode = '22023';
  end if;

  update public.score_assignments
  set
    title = trim(p_title),
    raw_max = p_raw_max,
    final_max = p_final_max
  where id = any(selected_assignment_ids);

  update public.score_entries
  set
    raw_max = p_raw_max,
    final_score = round((raw_score / p_raw_max) * p_final_max, 2),
    final_max = p_final_max,
    updated_at = now()
  where assignment_id = any(selected_assignment_ids);

  update public.submissions
  set
    assignment_title = trim(p_title),
    raw_max = p_raw_max,
    final_score = round((raw_score / p_raw_max) * p_final_max, 2),
    final_max = p_final_max
  where assignment_id = any(selected_assignment_ids);

  return query
  select assignment.*
  from public.score_assignments assignment
  where assignment.id = any(selected_assignment_ids)
  order by assignment.created_at, assignment.id;
end;
$$;

revoke all on function public.update_score_assignment_group(uuid, uuid[], text, numeric, numeric) from public;
grant execute on function public.update_score_assignment_group(uuid, uuid[], text, numeric, numeric) to authenticated;
comment on function public.update_score_assignment_group(uuid, uuid[], text, numeric, numeric)
is 'Atomically updates selected classrooms in one score-assignment group and recalculates related scores.';

create or replace function public.guard_student_profile_update()
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

  if auth.uid() <> old.id
    or new.id is distinct from old.id
    or new.role is distinct from old.role
    or new.student_code is distinct from old.student_code
    or new.class_name is distinct from old.class_name
    or new.school_name is distinct from old.school_name then
    raise exception 'ไม่สามารถเปลี่ยนข้อมูลสิทธิ์หรือห้องเรียนได้';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_student_profile_update on public.profiles;
create trigger guard_student_profile_update
before update on public.profiles
for each row execute function public.guard_student_profile_update();
revoke all on function public.guard_student_profile_update() from public, authenticated;

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
    or new.status is distinct from old.status
    or new.raw_score is distinct from old.raw_score
    or new.raw_max is distinct from old.raw_max
    or new.final_score is distinct from old.final_score
    or new.final_max is distinct from old.final_max
    or (
      new.file_path is distinct from old.file_path
      and coalesce(new.file_path, '') not like 'submissions/' || public.current_student_code() || '/%'
    ) then
    raise exception 'นักเรียนแก้ไขข้อมูลการตรวจหรือคะแนนไม่ได้';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_student_submission_update on public.submissions;
create trigger guard_student_submission_update
before update on public.submissions
for each row execute function public.guard_student_submission_update();
revoke all on function public.guard_student_submission_update() from public, authenticated;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'profiles', 'classrooms', 'students', 'materials', 'announcements',
        'score_assignments', 'score_entries', 'submissions', 'scores',
        'student_roster_uploads', 'material_download_logs'
      ])
  loop
    execute format('drop policy if exists %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end;
$$;

create policy "profiles select own or teacher" on public.profiles
for select to authenticated
using (auth.uid() = id or (public.is_teacher() and role = 'student'));
create policy "profiles update own" on public.profiles
for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "classrooms select related" on public.classrooms
for select to authenticated
using (public.is_teacher() or id = public.user_classroom_id());
create policy "classrooms insert teacher" on public.classrooms
for insert to authenticated with check (public.is_teacher());
create policy "classrooms update teacher" on public.classrooms
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "classrooms delete teacher" on public.classrooms
for delete to authenticated using (public.is_teacher());

create policy "students select own or teacher" on public.students
for select to authenticated
using (public.is_teacher() or student_code = public.current_student_code());
create policy "students insert teacher" on public.students
for insert to authenticated with check (public.is_teacher());
create policy "students update teacher" on public.students
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "students delete teacher" on public.students
for delete to authenticated using (public.is_teacher());

create policy "materials select related" on public.materials
for select to authenticated
using (
  public.is_teacher()
  or classroom_id = public.user_classroom_id()
  or (classroom_id is null and level = public.user_classroom_level())
);
create policy "materials insert teacher" on public.materials
for insert to authenticated with check (public.is_teacher());
create policy "materials update teacher" on public.materials
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "materials delete teacher" on public.materials
for delete to authenticated using (public.is_teacher());

create policy "announcements select related" on public.announcements
for select to authenticated
using (public.is_teacher() or classroom_id = public.user_classroom_id());
create policy "announcements insert teacher" on public.announcements
for insert to authenticated with check (public.is_teacher());
create policy "announcements update teacher" on public.announcements
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "announcements delete teacher" on public.announcements
for delete to authenticated using (public.is_teacher());

create policy "score assignments select related" on public.score_assignments
for select to authenticated
using (public.is_teacher() or classroom_id = public.user_classroom_id());
create policy "score assignments insert teacher" on public.score_assignments
for insert to authenticated with check (public.is_teacher());
create policy "score assignments update teacher" on public.score_assignments
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "score assignments delete teacher" on public.score_assignments
for delete to authenticated using (public.is_teacher());

create policy "score entries select own or teacher" on public.score_entries
for select to authenticated
using (public.is_teacher() or student_code = public.current_student_code());
create policy "score entries insert teacher" on public.score_entries
for insert to authenticated with check (public.is_teacher());
create policy "score entries update teacher" on public.score_entries
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "score entries delete teacher" on public.score_entries
for delete to authenticated using (public.is_teacher());

create policy "submissions select own or teacher" on public.submissions
for select to authenticated
using (public.is_teacher() or student_code = public.current_student_code());
create policy "submissions insert own or teacher" on public.submissions
for insert to authenticated
with check (
  public.is_teacher()
  or (
    student_code = public.current_student_code()
    and student_name = public.current_student_name()
    and classroom_id = public.user_classroom_id()
    and file_path like 'submissions/' || public.current_student_code() || '/%'
    and status = 'รอตรวจ'
    and raw_score = 0
    and final_score = 0
    and exists (
      select 1 from public.score_assignments assignment
      where assignment.id = submissions.assignment_id
        and assignment.classroom_id = public.user_classroom_id()
        and assignment.raw_max = submissions.raw_max
        and assignment.final_max = submissions.final_max
    )
  )
);
create policy "submissions update own or teacher" on public.submissions
for update to authenticated
using (public.is_teacher() or student_code = public.current_student_code())
with check (public.is_teacher() or student_code = public.current_student_code());
create policy "submissions delete teacher" on public.submissions
for delete to authenticated using (public.is_teacher());

create policy "legacy scores select own or teacher" on public.scores
for select to authenticated
using (public.is_teacher() or student_code = public.current_student_code());
create policy "legacy scores insert teacher" on public.scores
for insert to authenticated with check (public.is_teacher());
create policy "legacy scores update teacher" on public.scores
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "legacy scores delete teacher" on public.scores
for delete to authenticated using (public.is_teacher());

create policy "rosters select teacher" on public.student_roster_uploads
for select to authenticated using (public.is_teacher());
create policy "rosters insert teacher" on public.student_roster_uploads
for insert to authenticated with check (public.is_teacher());
create policy "rosters update teacher" on public.student_roster_uploads
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "rosters delete teacher" on public.student_roster_uploads
for delete to authenticated using (public.is_teacher());

create policy "download logs select own or teacher" on public.material_download_logs
for select to authenticated
using (public.is_teacher() or student_code = public.current_student_code());
create policy "download logs insert own" on public.material_download_logs
for insert to authenticated
with check (
  student_code = public.current_student_code()
  and student_name = public.current_student_name()
  and classroom_id = public.user_classroom_id()
  and exists (
    select 1 from public.materials material
    where material.id = material_download_logs.material_id
      and (
        material.classroom_id = public.user_classroom_id()
        or (material.classroom_id is null and material.level = public.user_classroom_level())
      )
  )
);
create policy "download logs delete teacher" on public.material_download_logs
for delete to authenticated using (public.is_teacher());

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'score_entries_raw_score_within_max' and conrelid = 'public.score_entries'::regclass) then
    alter table public.score_entries
      add constraint score_entries_raw_score_within_max check (raw_score <= raw_max) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'score_entries_final_score_within_max' and conrelid = 'public.score_entries'::regclass) then
    alter table public.score_entries
      add constraint score_entries_final_score_within_max check (final_score <= final_max) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'submissions_raw_score_within_max' and conrelid = 'public.submissions'::regclass) then
    alter table public.submissions
      add constraint submissions_raw_score_within_max check (raw_score <= raw_max) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'submissions_final_score_within_max' and conrelid = 'public.submissions'::regclass) then
    alter table public.submissions
      add constraint submissions_final_score_within_max check (final_score <= final_max) not valid;
  end if;
end;
$$;

create or replace function public.create_student_account(
  p_student_record_id uuid,
  p_student_code text,
  p_full_name text,
  p_class_name text default null,
  p_classroom_id uuid default null,
  p_password text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_caller_role text;
  v_email text;
  v_password text;
  v_user_id uuid;
  v_existing_user_id uuid;
  v_now timestamptz := now();
  v_instance_id uuid := coalesce((select instance_id from auth.users limit 1), '00000000-0000-0000-0000-000000000000'::uuid);
begin
  select role into v_caller_role
  from public.profiles
  where id = auth.uid();

  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
    and coalesce(v_caller_role, '') <> 'teacher' then
    raise exception 'เฉพาะบัญชีครูเท่านั้นที่สร้างบัญชีนักเรียนได้';
  end if;

  if coalesce(trim(p_student_code), '') = '' or coalesce(trim(p_full_name), '') = '' then
    raise exception 'ต้องมีรหัสนักเรียนและชื่อ-นามสกุล';
  end if;

  v_email := lower(trim(p_student_code)) || '@students.kruthai.local';
  v_password := coalesce(nullif(trim(p_password), ''), trim(p_student_code) || '@2569');

  if char_length(v_password) < 6 then
    raise exception 'รหัสผ่านเริ่มต้นต้องมีอย่างน้อย 6 ตัวอักษร';
  end if;

  select id
  into v_existing_user_id
  from auth.users
  where lower(email) = v_email
  limit 1;

  if v_existing_user_id is null then
    v_user_id := extensions.gen_random_uuid();

    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) values (
      v_instance_id,
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      v_now,
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object(
        'role', 'student',
        'full_name', trim(p_full_name),
        'student_code', trim(p_student_code),
        'class_name', coalesce(nullif(trim(p_class_name), ''), 'ยังไม่ได้เลือกห้องเรียน'),
        'school_name', 'โรงเรียนเทพศิรินทร์ นนทบุรี'
      ),
      v_now,
      v_now,
      '',
      '',
      '',
      ''
    );
  else
    v_user_id := v_existing_user_id;

    update auth.users
    set
      email = v_email,
      encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, v_now),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'role', 'student',
        'full_name', trim(p_full_name),
        'student_code', trim(p_student_code),
        'class_name', coalesce(nullif(trim(p_class_name), ''), 'ยังไม่ได้เลือกห้องเรียน'),
        'school_name', 'โรงเรียนเทพศิรินทร์ นนทบุรี'
      ),
      updated_at = v_now
    where id = v_user_id;
  end if;

  if exists (
    select 1
    from auth.identities
    where user_id = v_user_id and provider = 'email'
  ) then
    update auth.identities
    set
      identity_data = jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      provider_id = v_email,
      last_sign_in_at = coalesce(last_sign_in_at, v_now),
      updated_at = v_now
    where user_id = v_user_id and provider = 'email';
  else
    insert into auth.identities (
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at,
      id
    ) values (
      v_email,
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email',
      v_now,
      v_now,
      v_now,
      extensions.gen_random_uuid()
    );
  end if;

  insert into public.profiles (
    id,
    full_name,
    role,
    student_code,
    class_name,
    school_name
  ) values (
    v_user_id,
    trim(p_full_name),
    'student',
    trim(p_student_code),
    coalesce(nullif(trim(p_class_name), ''), 'ยังไม่ได้เลือกห้องเรียน'),
    'โรงเรียนเทพศิรินทร์ นนทบุรี'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    role = excluded.role,
    student_code = excluded.student_code,
    class_name = excluded.class_name,
    school_name = excluded.school_name;

  if p_student_record_id is not null then
    update public.students
    set
      auth_email = v_email,
      account_created_at = v_now
    where id = p_student_record_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'email', v_email,
    'mode', case when v_existing_user_id is null then 'created' else 'updated' end,
    'message', case when v_existing_user_id is null then 'สร้างบัญชีนักเรียนแล้ว' else 'รีเซ็ตรหัสบัญชีนักเรียนแล้ว' end
  );
end;
$$;

revoke all on function public.create_student_account(uuid, text, text, text, uuid, text) from public;
revoke all on function public.create_student_account(uuid, text, text, text, uuid, text) from authenticated;
grant execute on function public.create_student_account(uuid, text, text, text, uuid, text) to service_role;
comment on function public.create_student_account(uuid, text, text, text, uuid, text)
is 'Legacy admin fallback only. The application creates student accounts through the authenticated Netlify Function.';
notify pgrst, 'reload schema';

drop policy if exists "classroom files readable" on storage.objects;
drop policy if exists "classroom files uploadable" on storage.objects;
drop policy if exists "classroom files updateable" on storage.objects;
drop policy if exists "classroom files deleteable" on storage.objects;
drop policy if exists "classroom files select scoped" on storage.objects;
drop policy if exists "classroom files insert scoped" on storage.objects;
drop policy if exists "classroom files update teacher" on storage.objects;
drop policy if exists "classroom files delete teacher" on storage.objects;

create policy "classroom files select scoped" on storage.objects
for select to authenticated
using (
  bucket_id = 'classroom-files'
  and (
    public.is_teacher()
    or public.can_access_material_file(name)
    or public.can_access_submission_file(name)
    or (
      (storage.foldername(name))[1] = 'submissions'
      and (storage.foldername(name))[2] = public.current_student_code()
    )
  )
);

create policy "classroom files insert scoped" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'classroom-files'
  and (
    public.is_teacher()
    or (
      (storage.foldername(name))[1] = 'submissions'
      and (storage.foldername(name))[2] = public.current_student_code()
      and lower(storage.extension(name)) = any (array[
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov'
      ])
      and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 26214400
    )
  )
);

create policy "classroom files update teacher" on storage.objects
for update to authenticated
using (bucket_id = 'classroom-files' and public.is_teacher())
with check (bucket_id = 'classroom-files' and public.is_teacher());

create policy "classroom files delete teacher" on storage.objects
for delete to authenticated
using (bucket_id = 'classroom-files' and public.is_teacher());
