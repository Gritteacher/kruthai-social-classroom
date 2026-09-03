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
  view_count bigint not null default 0 check (view_count >= 0),
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
  assignment_type text not null default 'ทั่วไป',
  class_name text not null default 'ยังไม่ได้เลือกห้องเรียน',
  classroom_id uuid references public.classrooms (id) on delete set null,
  raw_max numeric not null check (raw_max > 0),
  final_max numeric not null check (final_max > 0),
  accepting_submissions boolean not null default true,
  submission_open_at timestamptz,
  submission_close_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.score_entries (
  id uuid primary key default uuid_generate_v4(),
  assignment_id uuid not null references public.score_assignments (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  student_code text not null,
  score_status text not null default 'ungraded' check (score_status in ('ungraded', 'scored', 'leave', 'expired', 'no_score')),
  raw_score numeric not null default 0 check (raw_score >= 0),
  raw_max numeric not null check (raw_max > 0),
  final_score numeric not null default 0 check (final_score >= 0),
  final_max numeric not null check (final_max > 0),
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

alter table public.score_entries add column if not exists score_status text;
update public.score_entries
set score_status = case when raw_score > 0 then 'scored' else 'ungraded' end
where score_status is null;
alter table public.score_entries alter column score_status set default 'ungraded';
alter table public.score_entries alter column score_status set not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'score_entries_score_status_check'
      and conrelid = 'public.score_entries'::regclass
  ) then
    alter table public.score_entries
      add constraint score_entries_score_status_check
      check (score_status in ('ungraded', 'scored', 'leave', 'expired', 'no_score'));
  end if;
end;
$$;

create table if not exists public.submissions (
  id uuid primary key default uuid_generate_v4(),
  assignment_id uuid references public.score_assignments (id) on delete set null,
  assignment_title text not null,
  student_name text not null,
  student_code text not null,
  classroom_id uuid references public.classrooms (id) on delete set null,
  file_path text,
  link_url text,
  submission_kind text not null default 'individual' check (submission_kind in ('individual', 'group')),
  group_member_codes text[] not null default '{}',
  group_member_names text[] not null default '{}',
  status text not null default 'รอตรวจ',
  raw_score numeric not null default 0 check (raw_score >= 0),
  raw_max numeric not null default 10 check (raw_max > 0),
  final_score numeric not null default 0 check (final_score >= 0),
  final_max numeric not null default 10 check (final_max > 0),
  reviewed_at timestamptz,
  file_deleted_at timestamptz,
  original_file_name text,
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

create table if not exists public.student_home_cards (
  id uuid primary key default uuid_generate_v4(),
  title text not null check (char_length(trim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 240),
  url text not null check (url ~* '^https?://'),
  classroom_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_home_cards_sort_idx
  on public.student_home_cards (is_active desc, sort_order, created_at);

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

create table if not exists public.chat_messages (
  id uuid primary key default extensions.uuid_generate_v4(),
  student_code text not null,
  student_name text not null,
  classroom_id uuid references public.classrooms (id) on delete set null,
  sender_role text not null check (sender_role in ('teacher', 'student')),
  body text not null check (char_length(trim(body)) between 1 and 1200),
  is_read_by_teacher boolean not null default false,
  is_read_by_student boolean not null default false,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_student_created_idx
  on public.chat_messages (student_code, created_at);
create index if not exists chat_messages_classroom_created_idx
  on public.chat_messages (classroom_id, created_at desc);

alter table public.chat_messages replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_messages'
    )
  then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;

alter table public.profiles add column if not exists school_name text default 'โรงเรียนเทพศิรินทร์ นนทบุรี';
alter table public.materials add column if not exists class_name text not null default 'ยังไม่ได้เลือกห้องเรียน';
alter table public.materials add column if not exists classroom_id uuid references public.classrooms (id) on delete set null;
alter table public.materials add column if not exists view_count bigint not null default 0 check (view_count >= 0);
alter table public.students add column if not exists classroom_id uuid references public.classrooms (id) on delete set null;
alter table public.students add column if not exists auth_email text;
alter table public.students add column if not exists account_created_at timestamptz;
alter table public.students alter column class_name set default 'ยังไม่ได้เลือกห้องเรียน';
alter table public.score_assignments add column if not exists classroom_id uuid references public.classrooms (id) on delete set null;
alter table public.score_assignments add column if not exists assignment_group_id uuid;
alter table public.score_assignments add column if not exists assignment_type text not null default 'ทั่วไป';
alter table public.score_assignments add column if not exists accepting_submissions boolean not null default true;
alter table public.score_assignments add column if not exists submission_open_at timestamptz;
alter table public.score_assignments add column if not exists submission_close_at timestamptz;
alter table public.score_assignments drop constraint if exists score_assignments_submission_window_check;
alter table public.score_assignments add constraint score_assignments_submission_window_check
check (submission_open_at is null or submission_close_at is null or submission_open_at < submission_close_at);
alter table public.score_assignments alter column class_name set default 'ยังไม่ได้เลือกห้องเรียน';
update public.score_assignments
set assignment_type = 'ทั่วไป'
where nullif(trim(assignment_type), '') is null;
alter table public.submissions add column if not exists assignment_id uuid references public.score_assignments (id) on delete set null;
alter table public.submissions add column if not exists classroom_id uuid references public.classrooms (id) on delete set null;
alter table public.submissions add column if not exists link_url text;
alter table public.submissions add column if not exists submission_kind text not null default 'individual';
alter table public.submissions add column if not exists group_member_codes text[] not null default '{}';
alter table public.submissions add column if not exists group_member_names text[] not null default '{}';
alter table public.submissions add column if not exists raw_score numeric not null default 0 check (raw_score >= 0);
alter table public.submissions add column if not exists raw_max numeric not null default 10 check (raw_max > 0);
alter table public.submissions add column if not exists final_score numeric not null default 0 check (final_score >= 0);
alter table public.submissions add column if not exists final_max numeric not null default 10 check (final_max > 0);
alter table public.submissions add column if not exists reviewed_at timestamptz;
alter table public.submissions add column if not exists file_deleted_at timestamptz;
alter table public.submissions add column if not exists original_file_name text;
update public.submissions
set original_file_name = regexp_replace(file_path, '^.*/[0-9]+-', '')
where file_path is not null
  and nullif(trim(original_file_name), '') is null;
update public.submissions
set reviewed_at = now()
where status = 'ตรวจแล้ว'
  and reviewed_at is null;
create index if not exists submissions_reviewed_file_cleanup_idx
  on public.submissions (reviewed_at)
  where status = 'ตรวจแล้ว'
    and file_path is not null
    and file_deleted_at is null;
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
end;
$$;

alter table public.submissions drop constraint if exists submissions_delivery_check;
alter table public.submissions
  add constraint submissions_delivery_check
  check (
    (file_path is not null and link_url is null)
    or (file_path is null and link_url is not null)
    or (file_path is null and link_url is null and file_deleted_at is not null)
  ) not valid;

create or replace function public.stamp_submission_file_retention()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.file_path is not null
    and (tg_op = 'INSERT' or old.file_path is distinct from new.file_path)
  then
    new.original_file_name := regexp_replace(new.file_path, '^.*/[0-9]+-', '');
    new.file_deleted_at := null;
  end if;

  if new.status = 'ตรวจแล้ว' then
    if tg_op = 'INSERT' then
      new.reviewed_at := coalesce(new.reviewed_at, now());
    elsif new.reviewed_at is null
      or old.status is distinct from new.status
      or old.raw_score is distinct from new.raw_score
      or old.raw_max is distinct from new.raw_max
      or old.final_score is distinct from new.final_score
      or old.final_max is distinct from new.final_max
    then
      new.reviewed_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists stamp_submission_file_retention on public.submissions;
create trigger stamp_submission_file_retention
before insert or update on public.submissions
for each row execute function public.stamp_submission_file_retention();
create index if not exists submissions_group_member_codes_idx
on public.submissions using gin (group_member_codes);
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
alter table public.student_home_cards enable row level security;
alter table public.student_roster_uploads enable row level security;
alter table public.material_download_logs enable row level security;
alter table public.chat_messages enable row level security;

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

create or replace function public.normalized_grade_level(level_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(level_text, '') ~* 'ม\.?\s*1' then 'ม.1'
    when coalesce(level_text, '') ~* 'ม\.?\s*2' then 'ม.2'
    when coalesce(level_text, '') ~* 'ม\.?\s*3' then 'ม.3'
    when coalesce(level_text, '') ~* 'ม\.?\s*4' then 'ม.4'
    when coalesce(level_text, '') ~* 'ม\.?\s*5' then 'ม.5'
    when coalesce(level_text, '') ~* 'ม\.?\s*6' then 'ม.6'
    else null
  end;
$$;

create or replace function public.material_level_matches(material_level text, classroom_level text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select public.normalized_grade_level(material_level) is not null
    and public.normalized_grade_level(material_level) = public.normalized_grade_level(classroom_level);
$$;

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
  where id = p_assignment_id and classroom_id = v_classroom_id;
  if not found then raise exception 'ไม่พบงานในห้องเรียนของนักเรียน'; end if;

  if not v_assignment.accepting_submissions then
    raise exception 'ASSIGNMENT_SUBMISSIONS_CLOSED' using errcode = '22023';
  end if;
  if v_assignment.submission_open_at is not null and now() < v_assignment.submission_open_at then
    raise exception 'ASSIGNMENT_SUBMISSIONS_NOT_OPEN' using errcode = '22023';
  end if;
  if v_assignment.submission_close_at is not null and now() >= v_assignment.submission_close_at then
    raise exception 'ASSIGNMENT_SUBMISSIONS_EXPIRED' using errcode = '22023';
  end if;

  if (v_file_path is null) = (v_link_url is null) then
    raise exception 'เลือกส่งไฟล์หรือลิงก์เพียงอย่างเดียว';
  end if;
  if v_file_path is not null and v_file_path not like 'submissions/' || v_student_code || '/%' then
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
  if cardinality(v_member_codes) > 20 then raise exception 'งานกลุ่มเลือกสมาชิกได้ไม่เกิน 20 คน'; end if;

  if (
    select count(*) from public.students s
    where s.classroom_id = v_classroom_id and s.student_code = any(v_member_codes)
  ) <> cardinality(v_member_codes) then
    raise exception 'สมาชิกทุกคนต้องอยู่ในห้องเรียนเดียวกัน';
  end if;

  select array_agg(s.full_name order by member.position)
  into v_member_names
  from unnest(v_member_codes) with ordinality as member(student_code, position)
  join public.students s
    on s.student_code = member.student_code and s.classroom_id = v_classroom_id;

  return query
  insert into public.submissions (
    assignment_id, assignment_title, student_name, student_code, classroom_id,
    file_path, link_url, submission_kind, group_member_codes, group_member_names,
    status, raw_score, raw_max, final_score, final_max
  ) values (
    v_assignment.id, v_assignment.title, v_student_name, v_student_code, v_classroom_id,
    v_file_path, v_link_url,
    case when cardinality(v_member_codes) > 1 then 'group' else 'individual' end,
    v_member_codes, v_member_names,
    'รอตรวจ', 0, v_assignment.raw_max, 0, v_assignment.final_max
  ) returning *;
end;
$$;

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
        or (m.classroom_id is null and public.material_level_matches(m.level, public.user_classroom_level()))
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
      and (
        submission.student_code = public.current_student_code()
        or public.current_student_code() = any(submission.group_member_codes)
      )
  );
$$;

revoke all on function public.is_teacher() from public;
revoke all on function public.current_student_code() from public;
revoke all on function public.current_student_name() from public;
revoke all on function public.user_classroom_id() from public;
revoke all on function public.user_classroom_level() from public;
revoke all on function public.normalized_grade_level(text) from public;
revoke all on function public.material_level_matches(text, text) from public;
revoke all on function public.get_classroom_peers() from public;
revoke all on function public.submit_assignment_work(uuid, text, text, text[]) from public;
revoke all on function public.review_submission_and_sync_scores(uuid, text, numeric, numeric, numeric) from public;
revoke all on function public.can_access_material_file(text) from public;
revoke all on function public.can_access_submission_file(text) from public;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.current_student_code() to authenticated;
grant execute on function public.current_student_name() to authenticated;
grant execute on function public.user_classroom_id() to authenticated;
grant execute on function public.user_classroom_level() to authenticated;
grant execute on function public.normalized_grade_level(text) to authenticated;
grant execute on function public.material_level_matches(text, text) to authenticated;
grant execute on function public.get_classroom_peers() to authenticated;
grant execute on function public.submit_assignment_work(uuid, text, text, text[]) to authenticated;
grant execute on function public.review_submission_and_sync_scores(uuid, text, numeric, numeric, numeric) to authenticated;
grant execute on function public.can_access_material_file(text) to authenticated;
grant execute on function public.can_access_submission_file(text) to authenticated;

create or replace function public.update_score_assignment_group(
  p_assignment_group_id uuid,
  p_classroom_ids uuid[],
  p_title text,
  p_assignment_type text,
  p_raw_max numeric,
  p_final_max numeric,
  p_accepting_submissions boolean,
  p_submission_open_at timestamptz,
  p_submission_close_at timestamptz
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
  v_assignment_type text := coalesce(nullif(trim(p_assignment_type), ''), 'ทั่วไป');
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

  if p_submission_open_at is not null and p_submission_close_at is not null
    and p_submission_open_at >= p_submission_close_at then
    raise exception 'INVALID_SUBMISSION_WINDOW' using errcode = '22023';
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
    assignment_type = v_assignment_type,
    raw_max = p_raw_max,
    final_max = p_final_max,
    accepting_submissions = coalesce(p_accepting_submissions, false),
    submission_open_at = p_submission_open_at,
    submission_close_at = p_submission_close_at
  where id = any(selected_assignment_ids);

  update public.score_entries
  set
    raw_max = p_raw_max,
    final_score = case when score_status = 'scored' then round((raw_score / p_raw_max) * p_final_max) else 0 end,
    final_max = p_final_max,
    updated_at = now()
  where assignment_id = any(selected_assignment_ids);

  update public.submissions
  set
    assignment_title = trim(p_title),
    raw_max = p_raw_max,
    final_score = round((raw_score / p_raw_max) * p_final_max),
    final_max = p_final_max
  where assignment_id = any(selected_assignment_ids);

  return query
  select assignment.*
  from public.score_assignments assignment
  where assignment.id = any(selected_assignment_ids)
  order by assignment.created_at, assignment.id;
end;
$$;

revoke all on function public.update_score_assignment_group(uuid, uuid[], text, text, numeric, numeric, boolean, timestamptz, timestamptz) from public;
grant execute on function public.update_score_assignment_group(uuid, uuid[], text, text, numeric, numeric, boolean, timestamptz, timestamptz) to authenticated;
comment on function public.update_score_assignment_group(uuid, uuid[], text, text, numeric, numeric, boolean, timestamptz, timestamptz)
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
        'profiles', 'classrooms', 'students', 'materials', 'announcements', 'student_home_cards',
        'score_assignments', 'score_entries', 'submissions', 'scores',
        'student_roster_uploads', 'material_download_logs', 'chat_messages'
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
  or (classroom_id is null and public.material_level_matches(level, public.user_classroom_level()))
);
create policy "materials insert teacher" on public.materials
for insert to authenticated with check (public.is_teacher());
create policy "materials update teacher" on public.materials
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "materials delete teacher" on public.materials
for delete to authenticated using (public.is_teacher());

create or replace function public.record_material_view(p_material_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_view_count bigint;
begin
  if auth.uid() is null then
    raise exception 'กรุณาเข้าสู่ระบบก่อนเปิดสื่อ';
  end if;

  if public.is_teacher() then
    select material.view_count
    into v_view_count
    from public.materials material
    where material.id = p_material_id;
  else
    update public.materials material
    set view_count = material.view_count + 1
    where material.id = p_material_id
      and public.current_student_code() is not null
      and (
        material.classroom_id = public.user_classroom_id()
        or (
          material.classroom_id is null
          and public.material_level_matches(material.level, public.user_classroom_level())
        )
      )
    returning material.view_count into v_view_count;
  end if;

  if v_view_count is null then
    raise exception 'ไม่พบสื่อหรือไม่มีสิทธิ์เปิดสื่อนี้';
  end if;

  return v_view_count;
end;
$$;

revoke all on function public.record_material_view(uuid) from public, anon;
grant execute on function public.record_material_view(uuid) to authenticated;

create policy "announcements select related" on public.announcements
for select to authenticated
using (public.is_teacher() or classroom_id = public.user_classroom_id());
create policy "announcements insert teacher" on public.announcements
for insert to authenticated with check (public.is_teacher());
create policy "announcements update teacher" on public.announcements
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "announcements delete teacher" on public.announcements
for delete to authenticated using (public.is_teacher());

create policy "student home cards select related" on public.student_home_cards
for select to authenticated
using (
  public.is_teacher()
  or (
    is_active
    and (
      cardinality(classroom_ids) = 0
      or public.user_classroom_id() = any(classroom_ids)
    )
  )
);
create policy "student home cards insert teacher" on public.student_home_cards
for insert to authenticated with check (public.is_teacher());
create policy "student home cards update teacher" on public.student_home_cards
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "student home cards delete teacher" on public.student_home_cards
for delete to authenticated using (public.is_teacher());

notify pgrst, 'reload schema';

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
        or (material.classroom_id is null and public.material_level_matches(material.level, public.user_classroom_level()))
      )
  )
);
create policy "download logs delete teacher" on public.material_download_logs
for delete to authenticated using (public.is_teacher());

create policy "chat messages select own or teacher" on public.chat_messages
for select to authenticated
using (public.is_teacher() or student_code = public.current_student_code());
create policy "chat messages insert teacher or own student" on public.chat_messages
for insert to authenticated with check (
  (
    public.is_teacher()
    and sender_role = 'teacher'
    and exists (
      select 1 from public.students student
      where student.student_code = chat_messages.student_code
        and (chat_messages.classroom_id is null or student.classroom_id = chat_messages.classroom_id)
    )
  )
  or (
    sender_role = 'student'
    and student_code = public.current_student_code()
    and student_name = public.current_student_name()
    and classroom_id = public.user_classroom_id()
  )
);
create policy "chat messages update teacher" on public.chat_messages
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "chat messages delete teacher" on public.chat_messages
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
drop policy if exists "classroom files delete scoped" on storage.objects;

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

-- Online worksheets: classroom-scoped PDF templates and per-page student answers.

create table if not exists public.worksheets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 180),
  description text not null default '',
  file_path text not null unique,
  original_file_name text not null,
  page_count integer not null check (page_count between 1 and 300),
  page_settings jsonb not null default '{}'::jsonb,
  accepting_submissions boolean not null default true,
  opens_at timestamptz,
  closes_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worksheets_submission_window_check check (
    opens_at is null or closes_at is null or opens_at < closes_at
  ),
  constraint worksheets_file_path_check check (file_path like 'worksheets/templates/%')
);

alter table public.worksheets
  add column if not exists page_settings jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'worksheets_page_settings_object_check'
      and conrelid = 'public.worksheets'::regclass
  ) then
    alter table public.worksheets
      add constraint worksheets_page_settings_object_check
      check (
        jsonb_typeof(page_settings) = 'object'
        and octet_length(page_settings::text) <= 1048576
      );
  end if;
end;
$$;

create table if not exists public.worksheet_classrooms (
  worksheet_id uuid not null references public.worksheets (id) on delete cascade,
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (worksheet_id, classroom_id)
);

create table if not exists public.worksheet_page_answers (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references public.worksheets (id) on delete cascade,
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  student_code text not null,
  student_name text not null,
  page_number integer not null check (page_number > 0),
  annotations jsonb not null default '[]'::jsonb,
  rotation smallint not null default 0 check (rotation in (0, 90, 180, 270)),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'returned', 'reviewed')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (worksheet_id, student_id, page_number),
  constraint worksheet_annotations_array_check check (jsonb_typeof(annotations) = 'array'),
  constraint worksheet_annotations_size_check check (octet_length(annotations::text) <= 1048576)
);

create table if not exists public.worksheet_teacher_pages (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references public.worksheets (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  page_number integer not null check (page_number > 0),
  annotations jsonb not null default '[]'::jsonb,
  rotation smallint not null default 0 check (rotation in (0, 90, 180, 270)),
  updated_at timestamptz not null default now(),
  unique (worksheet_id, teacher_id, page_number),
  constraint worksheet_teacher_annotations_array_check check (jsonb_typeof(annotations) = 'array'),
  constraint worksheet_teacher_annotations_size_check check (octet_length(annotations::text) <= 1048576)
);

alter table public.worksheet_page_answers
  add column if not exists rotation smallint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'worksheet_page_answers_rotation_check'
      and conrelid = 'public.worksheet_page_answers'::regclass
  ) then
    alter table public.worksheet_page_answers
      add constraint worksheet_page_answers_rotation_check
      check (rotation in (0, 90, 180, 270));
  end if;
end;
$$;

create index if not exists worksheet_classrooms_classroom_idx
  on public.worksheet_classrooms (classroom_id, worksheet_id);
create index if not exists worksheet_page_answers_student_idx
  on public.worksheet_page_answers (student_code, worksheet_id, page_number);
create index if not exists worksheet_page_answers_teacher_idx
  on public.worksheet_page_answers (worksheet_id, classroom_id, status, page_number);
create index if not exists worksheet_teacher_pages_owner_idx
  on public.worksheet_teacher_pages (teacher_id, worksheet_id, page_number);

alter table public.worksheets enable row level security;
alter table public.worksheet_classrooms enable row level security;
alter table public.worksheet_page_answers enable row level security;
alter table public.worksheet_teacher_pages enable row level security;

drop policy if exists "worksheets select related" on public.worksheets;
drop policy if exists "worksheets insert teacher" on public.worksheets;
drop policy if exists "worksheets update teacher" on public.worksheets;
drop policy if exists "worksheets delete teacher" on public.worksheets;
create policy "worksheets select related" on public.worksheets
for select to authenticated using (
  public.is_teacher()
  or exists (
    select 1 from public.worksheet_classrooms link
    where link.worksheet_id = worksheets.id
      and link.classroom_id = public.user_classroom_id()
  )
);
create policy "worksheets insert teacher" on public.worksheets
for insert to authenticated with check (public.is_teacher());
create policy "worksheets update teacher" on public.worksheets
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "worksheets delete teacher" on public.worksheets
for delete to authenticated using (public.is_teacher());

drop policy if exists "worksheet classrooms select related" on public.worksheet_classrooms;
drop policy if exists "worksheet classrooms insert teacher" on public.worksheet_classrooms;
drop policy if exists "worksheet classrooms update teacher" on public.worksheet_classrooms;
drop policy if exists "worksheet classrooms delete teacher" on public.worksheet_classrooms;
create policy "worksheet classrooms select related" on public.worksheet_classrooms
for select to authenticated using (
  public.is_teacher() or classroom_id = public.user_classroom_id()
);
create policy "worksheet classrooms insert teacher" on public.worksheet_classrooms
for insert to authenticated with check (public.is_teacher());
create policy "worksheet classrooms update teacher" on public.worksheet_classrooms
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "worksheet classrooms delete teacher" on public.worksheet_classrooms
for delete to authenticated using (public.is_teacher());

drop policy if exists "worksheet answers select own or teacher" on public.worksheet_page_answers;
drop policy if exists "worksheet answers update teacher" on public.worksheet_page_answers;
create policy "worksheet answers select own or teacher" on public.worksheet_page_answers
for select to authenticated using (
  public.is_teacher() or student_code = public.current_student_code()
);
create policy "worksheet answers update teacher" on public.worksheet_page_answers
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());

drop policy if exists "teacher worksheet pages own select" on public.worksheet_teacher_pages;
drop policy if exists "teacher worksheet pages own insert" on public.worksheet_teacher_pages;
drop policy if exists "teacher worksheet pages own update" on public.worksheet_teacher_pages;
drop policy if exists "teacher worksheet pages own delete" on public.worksheet_teacher_pages;
create policy "teacher worksheet pages own select" on public.worksheet_teacher_pages
for select to authenticated using (public.is_teacher() and teacher_id = auth.uid());
create policy "teacher worksheet pages own insert" on public.worksheet_teacher_pages
for insert to authenticated with check (public.is_teacher() and teacher_id = auth.uid());
create policy "teacher worksheet pages own update" on public.worksheet_teacher_pages
for update to authenticated
using (public.is_teacher() and teacher_id = auth.uid())
with check (public.is_teacher() and teacher_id = auth.uid());
create policy "teacher worksheet pages own delete" on public.worksheet_teacher_pages
for delete to authenticated using (public.is_teacher() and teacher_id = auth.uid());

drop function if exists public.save_worksheet_page(uuid, integer, jsonb, boolean);
create or replace function public.save_worksheet_page(
  p_worksheet_id uuid,
  p_page_number integer,
  p_annotations jsonb,
  p_rotation smallint default 0,
  p_submit boolean default false
)
returns setof public.worksheet_page_answers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student public.students%rowtype;
  v_worksheet public.worksheets%rowtype;
  v_existing public.worksheet_page_answers%rowtype;
  v_status text;
begin
  if auth.uid() is null or public.is_teacher() then
    raise exception 'STUDENT_REQUIRED' using errcode = '42501';
  end if;

  select * into v_student
  from public.students
  where student_code = public.current_student_code()
    and classroom_id = public.user_classroom_id();
  if not found then raise exception 'STUDENT_NOT_FOUND' using errcode = '42501'; end if;

  select worksheet.* into v_worksheet
  from public.worksheets worksheet
  join public.worksheet_classrooms link on link.worksheet_id = worksheet.id
  where worksheet.id = p_worksheet_id
    and link.classroom_id = v_student.classroom_id;
  if not found then raise exception 'WORKSHEET_NOT_FOUND' using errcode = '42501'; end if;

  if p_page_number < 1 or p_page_number > v_worksheet.page_count then
    raise exception 'INVALID_WORKSHEET_PAGE' using errcode = '22023';
  end if;
  if p_annotations is null or jsonb_typeof(p_annotations) <> 'array' or octet_length(p_annotations::text) > 1048576 then
    raise exception 'INVALID_WORKSHEET_ANNOTATIONS' using errcode = '22023';
  end if;
  if p_rotation not in (0, 90, 180, 270) then
    raise exception 'INVALID_WORKSHEET_ROTATION' using errcode = '22023';
  end if;
  if not v_worksheet.accepting_submissions then
    raise exception 'WORKSHEET_CLOSED' using errcode = '22023';
  end if;
  if v_worksheet.opens_at is not null and now() < v_worksheet.opens_at then
    raise exception 'WORKSHEET_NOT_OPEN' using errcode = '22023';
  end if;
  if v_worksheet.closes_at is not null and now() >= v_worksheet.closes_at then
    raise exception 'WORKSHEET_EXPIRED' using errcode = '22023';
  end if;

  select * into v_existing
  from public.worksheet_page_answers
  where worksheet_id = p_worksheet_id
    and student_id = v_student.id
    and page_number = p_page_number;

  if found and v_existing.status in ('submitted', 'reviewed') then
    raise exception 'WORKSHEET_PAGE_LOCKED' using errcode = '22023';
  end if;
  v_status := case when p_submit then 'submitted' else 'draft' end;

  return query
  insert into public.worksheet_page_answers (
    worksheet_id, classroom_id, student_id, student_code, student_name,
    page_number, annotations, rotation, status, submitted_at, updated_at
  ) values (
    v_worksheet.id, v_student.classroom_id, v_student.id, v_student.student_code, v_student.full_name,
    p_page_number, p_annotations, p_rotation, v_status, case when p_submit then now() else null end, now()
  )
  on conflict (worksheet_id, student_id, page_number) do update
  set annotations = excluded.annotations,
      rotation = excluded.rotation,
      status = excluded.status,
      submitted_at = case when p_submit then now() else worksheet_page_answers.submitted_at end,
      reviewed_at = null,
      updated_at = now()
  returning *;
end;
$$;

create or replace function public.save_teacher_worksheet_page(
  p_worksheet_id uuid,
  p_page_number integer,
  p_annotations jsonb,
  p_rotation smallint default 0
)
returns setof public.worksheet_teacher_pages
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worksheet public.worksheets%rowtype;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;
  select * into v_worksheet from public.worksheets where id = p_worksheet_id;
  if not found then raise exception 'WORKSHEET_NOT_FOUND' using errcode = '42501'; end if;
  if p_page_number < 1 or p_page_number > v_worksheet.page_count then
    raise exception 'INVALID_WORKSHEET_PAGE' using errcode = '22023';
  end if;
  if p_annotations is null or jsonb_typeof(p_annotations) <> 'array' or octet_length(p_annotations::text) > 1048576 then
    raise exception 'INVALID_WORKSHEET_ANNOTATIONS' using errcode = '22023';
  end if;
  if p_rotation not in (0, 90, 180, 270) then
    raise exception 'INVALID_WORKSHEET_ROTATION' using errcode = '22023';
  end if;

  return query
  insert into public.worksheet_teacher_pages (
    worksheet_id, teacher_id, page_number, annotations, rotation, updated_at
  ) values (
    v_worksheet.id, auth.uid(), p_page_number, p_annotations, p_rotation, now()
  )
  on conflict (worksheet_id, teacher_id, page_number) do update
  set annotations = excluded.annotations,
      rotation = excluded.rotation,
      updated_at = now()
  returning *;
end;
$$;

create or replace function public.can_access_worksheet_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select exists (
    select 1
    from public.worksheets worksheet
    join public.worksheet_classrooms link on link.worksheet_id = worksheet.id
    where worksheet.file_path = object_name
      and link.classroom_id = public.user_classroom_id()
  );
$$;

create or replace function public.update_worksheet_page_view(
  p_worksheet_id uuid,
  p_page_number integer,
  p_rotation smallint,
  p_crop jsonb default null
)
returns setof public.worksheets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worksheet public.worksheets%rowtype;
  v_current_rotation integer;
  v_crop jsonb;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;
  select * into v_worksheet from public.worksheets
  where id = p_worksheet_id for update;
  if not found then raise exception 'WORKSHEET_NOT_FOUND' using errcode = '42501'; end if;
  if p_page_number < 1 or p_page_number > v_worksheet.page_count then
    raise exception 'INVALID_WORKSHEET_PAGE' using errcode = '22023';
  end if;
  if p_rotation not in (0, 90, 180, 270) then
    raise exception 'INVALID_WORKSHEET_ROTATION' using errcode = '22023';
  end if;
  v_crop := coalesce(p_crop, '{"x":0,"y":0,"width":1,"height":1}'::jsonb);
  if jsonb_typeof(v_crop) <> 'object'
    or not (v_crop ?& array['x', 'y', 'width', 'height'])
    or (v_crop ->> 'x')::numeric < 0
    or (v_crop ->> 'y')::numeric < 0
    or (v_crop ->> 'width')::numeric <= 0
    or (v_crop ->> 'height')::numeric <= 0
    or (v_crop ->> 'x')::numeric + (v_crop ->> 'width')::numeric > 1
    or (v_crop ->> 'y')::numeric + (v_crop ->> 'height')::numeric > 1
  then
    raise exception 'INVALID_WORKSHEET_CROP' using errcode = '22023';
  end if;
  v_current_rotation := coalesce(
    (v_worksheet.page_settings -> p_page_number::text ->> 'rotation')::integer,
    0
  );
  if v_current_rotation <> p_rotation and (
    exists (
      select 1 from public.worksheet_page_answers answer
      where answer.worksheet_id = p_worksheet_id
        and answer.page_number = p_page_number
        and jsonb_array_length(answer.annotations) > 0
    )
    or exists (
      select 1 from public.worksheet_teacher_pages teacher_page
      where teacher_page.worksheet_id = p_worksheet_id
        and teacher_page.page_number = p_page_number
        and jsonb_array_length(teacher_page.annotations) > 0
    )
  ) then
    raise exception 'WORKSHEET_PAGE_HAS_WRITING' using errcode = '22023';
  end if;

  return query
  update public.worksheets
  set page_settings = jsonb_set(
        coalesce(page_settings, '{}'::jsonb),
        array[p_page_number::text],
        jsonb_build_object('rotation', p_rotation, 'crop', v_crop, 'updatedAt', now()),
        true
      ),
      updated_at = now()
  where id = p_worksheet_id
  returning *;
end;
$$;

create or replace function public.rotate_all_worksheet_pages(
  p_worksheet_id uuid,
  p_delta smallint default 180
)
returns setof public.worksheets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worksheet public.worksheets%rowtype;
  v_page integer;
  v_rotation integer;
  v_settings jsonb;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;
  if p_delta not in (90, 180, 270) then
    raise exception 'INVALID_WORKSHEET_ROTATION' using errcode = '22023';
  end if;
  select * into v_worksheet from public.worksheets
  where id = p_worksheet_id for update;
  if not found then raise exception 'WORKSHEET_NOT_FOUND' using errcode = '42501'; end if;
  if exists (
    select 1 from public.worksheet_page_answers answer
    where answer.worksheet_id = p_worksheet_id
      and jsonb_array_length(answer.annotations) > 0
  ) or exists (
    select 1 from public.worksheet_teacher_pages teacher_page
    where teacher_page.worksheet_id = p_worksheet_id
      and jsonb_array_length(teacher_page.annotations) > 0
  ) then
    raise exception 'WORKSHEET_PAGE_HAS_WRITING' using errcode = '22023';
  end if;
  v_settings := coalesce(v_worksheet.page_settings, '{}'::jsonb);
  for v_page in 1..v_worksheet.page_count loop
    v_rotation := (
      coalesce((v_settings -> v_page::text ->> 'rotation')::integer, 0)
      + p_delta
    ) % 360;
    v_settings := jsonb_set(
      v_settings,
      array[v_page::text],
      jsonb_build_object(
        'rotation', v_rotation,
        'crop', '{"x":0,"y":0,"width":1,"height":1}'::jsonb,
        'updatedAt', now()
      ),
      true
    );
  end loop;
  return query
  update public.worksheets
  set page_settings = v_settings, updated_at = now()
  where id = p_worksheet_id
  returning *;
end;
$$;

revoke all on function public.save_worksheet_page(uuid, integer, jsonb, smallint, boolean) from public, anon;
grant execute on function public.save_worksheet_page(uuid, integer, jsonb, smallint, boolean) to authenticated;
revoke all on function public.save_teacher_worksheet_page(uuid, integer, jsonb, smallint) from public, anon;
grant execute on function public.save_teacher_worksheet_page(uuid, integer, jsonb, smallint) to authenticated;
revoke all on function public.update_worksheet_page_view(uuid, integer, smallint, jsonb) from public, anon;
grant execute on function public.update_worksheet_page_view(uuid, integer, smallint, jsonb) to authenticated;
revoke all on function public.rotate_all_worksheet_pages(uuid, smallint) from public, anon;
grant execute on function public.rotate_all_worksheet_pages(uuid, smallint) to authenticated;
revoke all on function public.can_access_worksheet_file(text) from public, anon;
grant execute on function public.can_access_worksheet_file(text) to authenticated;

grant select, insert, update, delete on public.worksheets to authenticated;
grant select, insert, update, delete on public.worksheet_classrooms to authenticated;
grant select, update on public.worksheet_page_answers to authenticated;
revoke insert, delete on public.worksheet_page_answers from authenticated;
grant select, insert, update, delete on public.worksheet_teacher_pages to authenticated;

drop policy if exists "classroom files select scoped" on storage.objects;
create policy "classroom files select scoped" on storage.objects
for select to authenticated
using (
  bucket_id = 'classroom-files'
  and (
    public.is_teacher()
    or public.can_access_material_file(name)
    or public.can_access_submission_file(name)
    or public.can_access_worksheet_file(name)
    or (
      (storage.foldername(name))[1] = 'submissions'
      and (storage.foldername(name))[2] = public.current_student_code()
    )
  )
);

notify pgrst, 'reload schema';

-- Worksheet page-to-score linking and atomic grading.

alter table public.score_entries add column if not exists source_type text;
alter table public.score_entries add column if not exists source_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'score_entries_source_type_check'
      and conrelid = 'public.score_entries'::regclass
  ) then
    alter table public.score_entries
      add constraint score_entries_source_type_check
      check (source_type is null or source_type in ('manual', 'submission', 'worksheet'));
  end if;
end;
$$;

create table if not exists public.worksheet_score_links (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references public.worksheets (id) on delete cascade,
  page_number integer not null check (page_number > 0),
  assignment_group_id uuid not null,
  page_max_score numeric not null check (page_max_score > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worksheet_id, page_number, assignment_group_id)
);

create table if not exists public.worksheet_page_grades (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.worksheet_page_answers (id) on delete cascade,
  score_link_id uuid not null references public.worksheet_score_links (id) on delete restrict,
  score numeric not null check (score >= 0),
  feedback text not null default '',
  graded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  graded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (answer_id, score_link_id)
);

create index if not exists worksheet_score_links_worksheet_page_idx
  on public.worksheet_score_links (worksheet_id, page_number, sort_order);
create index if not exists worksheet_score_links_group_idx
  on public.worksheet_score_links (assignment_group_id, worksheet_id);
create index if not exists worksheet_page_grades_answer_idx
  on public.worksheet_page_grades (answer_id, score_link_id);
create index if not exists worksheet_page_grades_link_idx
  on public.worksheet_page_grades (score_link_id, answer_id);

alter table public.worksheet_score_links enable row level security;
alter table public.worksheet_page_grades enable row level security;

drop policy if exists "worksheet score links select related" on public.worksheet_score_links;
drop policy if exists "worksheet score links insert teacher" on public.worksheet_score_links;
drop policy if exists "worksheet score links update teacher" on public.worksheet_score_links;
drop policy if exists "worksheet score links delete teacher" on public.worksheet_score_links;
create policy "worksheet score links select related" on public.worksheet_score_links
for select to authenticated using (
  public.is_teacher()
  or exists (
    select 1
    from public.worksheet_classrooms classroom_link
    where classroom_link.worksheet_id = worksheet_score_links.worksheet_id
      and classroom_link.classroom_id = public.user_classroom_id()
  )
);
create policy "worksheet score links insert teacher" on public.worksheet_score_links
for insert to authenticated with check (public.is_teacher());
create policy "worksheet score links update teacher" on public.worksheet_score_links
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "worksheet score links delete teacher" on public.worksheet_score_links
for delete to authenticated using (public.is_teacher());

drop policy if exists "worksheet page grades select own or teacher" on public.worksheet_page_grades;
drop policy if exists "worksheet page grades insert teacher" on public.worksheet_page_grades;
drop policy if exists "worksheet page grades update teacher" on public.worksheet_page_grades;
drop policy if exists "worksheet page grades delete teacher" on public.worksheet_page_grades;
create policy "worksheet page grades select own or teacher" on public.worksheet_page_grades
for select to authenticated using (
  public.is_teacher()
  or exists (
    select 1
    from public.worksheet_page_answers answer
    where answer.id = worksheet_page_grades.answer_id
      and answer.student_code = public.current_student_code()
  )
);
create policy "worksheet page grades insert teacher" on public.worksheet_page_grades
for insert to authenticated with check (public.is_teacher());
create policy "worksheet page grades update teacher" on public.worksheet_page_grades
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "worksheet page grades delete teacher" on public.worksheet_page_grades
for delete to authenticated using (public.is_teacher());

create or replace function public.replace_worksheet_page_score_links(
  p_worksheet_id uuid,
  p_page_number integer,
  p_links jsonb
)
returns setof public.worksheet_score_links
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worksheet public.worksheets%rowtype;
  v_item jsonb;
  v_group_id uuid;
  v_page_max numeric;
  v_sort_order integer;
  v_group_ids uuid[] := array[]::uuid[];
  v_room_count integer;
  v_group_room_count integer;
  v_assignment_raw_max numeric;
  v_other_page_total numeric;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;
  if p_links is null or jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) > 100 then
    raise exception 'INVALID_WORKSHEET_SCORE_LINKS' using errcode = '22023';
  end if;

  select * into v_worksheet
  from public.worksheets
  where id = p_worksheet_id
  for update;
  if not found then raise exception 'WORKSHEET_NOT_FOUND' using errcode = '22023'; end if;
  if p_page_number < 1 or p_page_number > v_worksheet.page_count then
    raise exception 'INVALID_WORKSHEET_PAGE' using errcode = '22023';
  end if;

  select count(*) into v_room_count
  from public.worksheet_classrooms
  where worksheet_id = p_worksheet_id;
  if v_room_count = 0 then raise exception 'WORKSHEET_CLASSROOM_REQUIRED' using errcode = '22023'; end if;

  for v_item in select value from jsonb_array_elements(p_links)
  loop
    begin
      if jsonb_typeof(v_item -> 'assignment_group_id') <> 'string'
        or jsonb_typeof(v_item -> 'page_max_score') <> 'number'
      then
        raise exception 'INVALID_WORKSHEET_SCORE_LINK';
      end if;
      v_group_id := (v_item ->> 'assignment_group_id')::uuid;
      v_page_max := (v_item ->> 'page_max_score')::numeric;
      v_sort_order := greatest(0, coalesce((v_item ->> 'sort_order')::integer, 0));
    exception when others then
      raise exception 'INVALID_WORKSHEET_SCORE_LINK' using errcode = '22023';
    end;

    if v_page_max <= 0 then
      raise exception 'INVALID_WORKSHEET_PAGE_MAX' using errcode = '22023';
    end if;
    if v_group_id = any(v_group_ids) then
      raise exception 'DUPLICATE_WORKSHEET_SCORE_LINK' using errcode = '22023';
    end if;

    select count(distinct assignment.classroom_id), min(assignment.raw_max)
    into v_group_room_count, v_assignment_raw_max
    from public.score_assignments assignment
    join public.worksheet_classrooms classroom_link
      on classroom_link.worksheet_id = p_worksheet_id
      and classroom_link.classroom_id = assignment.classroom_id
    where assignment.assignment_group_id = v_group_id;

    if v_group_room_count <> v_room_count or v_assignment_raw_max is null then
      raise exception 'ASSIGNMENT_GROUP_MISSING_CLASSROOM' using errcode = '22023';
    end if;

    select coalesce(sum(link.page_max_score), 0)
    into v_other_page_total
    from public.worksheet_score_links link
    where link.worksheet_id = p_worksheet_id
      and link.assignment_group_id = v_group_id
      and link.page_number <> p_page_number;

    if v_other_page_total + v_page_max > v_assignment_raw_max then
      raise exception 'WORKSHEET_LINK_TOTAL_EXCEEDS_ASSIGNMENT_MAX:%', v_assignment_raw_max
        using errcode = '22023';
    end if;

    v_group_ids := array_append(v_group_ids, v_group_id);

    insert into public.worksheet_score_links (
      worksheet_id, page_number, assignment_group_id, page_max_score,
      sort_order, created_by, created_at, updated_at
    ) values (
      p_worksheet_id, p_page_number, v_group_id, v_page_max,
      v_sort_order, auth.uid(), now(), now()
    )
    on conflict (worksheet_id, page_number, assignment_group_id) do update
    set page_max_score = excluded.page_max_score,
        sort_order = excluded.sort_order,
        updated_at = now();
  end loop;

  if exists (
    select 1
    from public.worksheet_score_links link
    where link.worksheet_id = p_worksheet_id
      and link.page_number = p_page_number
      and not (link.assignment_group_id = any(v_group_ids))
      and exists (
        select 1 from public.worksheet_page_grades grade
        where grade.score_link_id = link.id
      )
  ) then
    raise exception 'WORKSHEET_LINK_HAS_GRADES' using errcode = '22023';
  end if;

  delete from public.worksheet_score_links link
  where link.worksheet_id = p_worksheet_id
    and link.page_number = p_page_number
    and not (link.assignment_group_id = any(v_group_ids));

  return query
  select link.*
  from public.worksheet_score_links link
  where link.worksheet_id = p_worksheet_id
  order by link.page_number, link.sort_order, link.created_at, link.id;
end;
$$;

create or replace function public.grade_worksheet_pages_and_sync_scores(
  p_answer_ids uuid[],
  p_grades jsonb
)
returns setof public.worksheet_page_answers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_answer_id uuid;
  v_score_link_id uuid;
  v_score numeric;
  v_answer public.worksheet_page_answers%rowtype;
  v_link public.worksheet_score_links%rowtype;
  v_assignment public.score_assignments%rowtype;
  v_target record;
  v_raw_score numeric;
  v_final_score numeric;
  v_answer_count integer;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_answer_ids), 0) = 0
    or cardinality(p_answer_ids) > 100
    or array_position(p_answer_ids, null) is not null
  then
    raise exception 'WORKSHEET_ANSWERS_REQUIRED' using errcode = '22023';
  end if;
  if p_grades is null or jsonb_typeof(p_grades) <> 'array' or jsonb_array_length(p_grades) > 500 then
    raise exception 'INVALID_WORKSHEET_GRADES' using errcode = '22023';
  end if;

  select count(*) into v_answer_count
  from public.worksheet_page_answers answer
  where answer.id = any(p_answer_ids)
    and answer.status in ('submitted', 'reviewed');
  if v_answer_count <> cardinality(p_answer_ids) then
    raise exception 'WORKSHEET_ANSWER_NOT_REVIEWABLE' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_grades)
  loop
    begin
      if jsonb_typeof(v_item -> 'answer_id') <> 'string'
        or jsonb_typeof(v_item -> 'score_link_id') <> 'string'
        or jsonb_typeof(v_item -> 'score') <> 'number'
      then
        raise exception 'INVALID_WORKSHEET_GRADE';
      end if;
      v_answer_id := (v_item ->> 'answer_id')::uuid;
      v_score_link_id := (v_item ->> 'score_link_id')::uuid;
      v_score := (v_item ->> 'score')::numeric;
    exception when others then
      raise exception 'INVALID_WORKSHEET_GRADE' using errcode = '22023';
    end;

    if not (v_answer_id = any(p_answer_ids)) then
      raise exception 'WORKSHEET_GRADE_OUTSIDE_SELECTION' using errcode = '22023';
    end if;

    select * into v_answer
    from public.worksheet_page_answers answer
    where answer.id = v_answer_id
    for update;

    select * into v_link
    from public.worksheet_score_links link
    where link.id = v_score_link_id
      and link.worksheet_id = v_answer.worksheet_id
      and link.page_number = v_answer.page_number;
    if not found then raise exception 'WORKSHEET_SCORE_LINK_NOT_FOUND' using errcode = '22023'; end if;
    if v_score < 0 or v_score > v_link.page_max_score then
      raise exception 'WORKSHEET_SCORE_OUT_OF_RANGE' using errcode = '22023';
    end if;

    insert into public.worksheet_page_grades (
      answer_id, score_link_id, score, feedback, graded_by, graded_at, updated_at
    ) values (
      v_answer_id, v_score_link_id, v_score,
      coalesce(v_item ->> 'feedback', ''), auth.uid(), now(), now()
    )
    on conflict (answer_id, score_link_id) do update
    set score = excluded.score,
        feedback = excluded.feedback,
        graded_by = auth.uid(),
        graded_at = now(),
        updated_at = now();
  end loop;

  if exists (
    select 1
    from public.worksheet_page_answers answer
    join public.worksheet_score_links link
      on link.worksheet_id = answer.worksheet_id
      and link.page_number = answer.page_number
    where answer.id = any(p_answer_ids)
      and not exists (
        select 1
        from public.worksheet_page_grades grade
        where grade.answer_id = answer.id
          and grade.score_link_id = link.id
      )
  ) then
    raise exception 'WORKSHEET_GRADE_REQUIRED' using errcode = '22023';
  end if;

  update public.worksheet_page_answers answer
  set status = 'reviewed', reviewed_at = now(), updated_at = now()
  where answer.id = any(p_answer_ids);

  for v_target in
    select distinct
      answer.student_id,
      answer.student_code,
      answer.classroom_id,
      link.assignment_group_id
    from public.worksheet_page_answers answer
    join public.worksheet_score_links link
      on link.worksheet_id = answer.worksheet_id
      and link.page_number = answer.page_number
    where answer.id = any(p_answer_ids)
  loop
    select * into v_assignment
    from public.score_assignments assignment
    where assignment.assignment_group_id = v_target.assignment_group_id
      and assignment.classroom_id = v_target.classroom_id
    order by assignment.created_at, assignment.id
    limit 1;
    if not found then raise exception 'ASSIGNMENT_NOT_FOUND_FOR_WORKSHEET' using errcode = '22023'; end if;

    select coalesce(sum(grade.score), 0)
    into v_raw_score
    from public.worksheet_page_grades grade
    join public.worksheet_page_answers answer on answer.id = grade.answer_id
    join public.worksheet_score_links link on link.id = grade.score_link_id
    where answer.student_id = v_target.student_id
      and answer.classroom_id = v_target.classroom_id
      and answer.status = 'reviewed'
      and link.assignment_group_id = v_target.assignment_group_id;

    v_raw_score := greatest(0, least(v_assignment.raw_max, v_raw_score));
    v_final_score := greatest(
      0,
      least(v_assignment.final_max, round((v_raw_score / v_assignment.raw_max) * v_assignment.final_max))
    );

    insert into public.score_entries (
      assignment_id, student_id, student_code, score_status,
      raw_score, raw_max, final_score, final_max,
      source_type, source_id, updated_at
    ) values (
      v_assignment.id, v_target.student_id, v_target.student_code, 'scored',
      v_raw_score, v_assignment.raw_max, v_final_score, v_assignment.final_max,
      'worksheet', v_target.assignment_group_id, now()
    )
    on conflict (assignment_id, student_id) do update
    set student_code = excluded.student_code,
        score_status = excluded.score_status,
        raw_score = excluded.raw_score,
        raw_max = excluded.raw_max,
        final_score = excluded.final_score,
        final_max = excluded.final_max,
        source_type = excluded.source_type,
        source_id = excluded.source_id,
        updated_at = now();
  end loop;

  return query
  select answer.*
  from public.worksheet_page_answers answer
  where answer.id = any(p_answer_ids)
  order by answer.student_name, answer.page_number, answer.id;
end;
$$;

create or replace function public.return_worksheet_pages(p_answer_ids uuid[])
returns setof public.worksheet_page_answers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_answer_count integer;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_answer_ids), 0) = 0
    or cardinality(p_answer_ids) > 100
    or array_position(p_answer_ids, null) is not null
  then
    raise exception 'WORKSHEET_ANSWERS_REQUIRED' using errcode = '22023';
  end if;

  select count(*) into v_answer_count
  from public.worksheet_page_answers answer
  where answer.id = any(p_answer_ids)
    and answer.status = 'submitted';
  if v_answer_count <> cardinality(p_answer_ids) then
    raise exception 'WORKSHEET_ANSWER_NOT_RETURNABLE' using errcode = '22023';
  end if;

  return query
  update public.worksheet_page_answers answer
  set status = 'returned', reviewed_at = null, updated_at = now()
  where answer.id = any(p_answer_ids)
  returning answer.*;
end;
$$;

revoke all on function public.replace_worksheet_page_score_links(uuid, integer, jsonb) from public, anon;
grant execute on function public.replace_worksheet_page_score_links(uuid, integer, jsonb) to authenticated;
revoke all on function public.grade_worksheet_pages_and_sync_scores(uuid[], jsonb) from public, anon;
grant execute on function public.grade_worksheet_pages_and_sync_scores(uuid[], jsonb) to authenticated;
revoke all on function public.return_worksheet_pages(uuid[]) from public, anon;
grant execute on function public.return_worksheet_pages(uuid[]) to authenticated;

grant select, insert, update, delete on public.worksheet_score_links to authenticated;
grant select, insert, update, delete on public.worksheet_page_grades to authenticated;

comment on table public.worksheet_score_links
is 'Maps one worksheet page to one or more classroom-independent score-assignment groups.';
comment on table public.worksheet_page_grades
is 'Stores each student page score before synchronizing the aggregate into score_entries.';

notify pgrst, 'reload schema';
