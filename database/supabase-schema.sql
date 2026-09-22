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

-- Retire automatic grading without deleting scores, submissions, files, or audit history.
begin;

-- Remove every legacy overload so older deployments cannot apply AI scores.
do $retire$
declare
  routine regprocedure;
  archive_name text;
begin
  for routine in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'apply_submission_ai_grade'
  loop
    execute format('drop function %s', routine);
  end loop;

  if to_regclass('public.worksheet_page_answers') is not null then
    execute 'drop trigger if exists worksheet_answer_sync_ai_review_status on public.worksheet_page_answers';
  end if;

  -- Old review/settings tables are retained as read-only audit history.
  -- Workers from older deployment URLs must not be able to write to them.
  foreach archive_name in array array['submission_ai_reviews', 'worksheet_ai_reviews', 'worksheet_ai_settings']
  loop
    if to_regclass('public.' || archive_name) is not null then
      execute format('revoke insert, update, delete, truncate on table public.%I from public, anon, authenticated, service_role', archive_name);
    end if;
  end loop;
end;
$retire$;

drop function if exists public.sync_worksheet_ai_review_status();
notify pgrst, 'reload schema';
commit;

-- Import a classroom score sheet as one atomic teacher-only operation.
begin;
create or replace function public.import_score_entries(p_classroom_id uuid, p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb; v_assignment public.score_assignments%rowtype; v_student public.students%rowtype;
  v_assignment_id uuid; v_student_id uuid; v_status text; v_raw_score numeric;
  v_pair_key text; v_seen_pairs text[] := array[]::text[]; v_count integer := 0;
begin
  if auth.uid() is null or not public.is_teacher() then raise exception 'TEACHER_REQUIRED' using errcode = '42501'; end if;
  if p_classroom_id is null or not exists (select 1 from public.classrooms where id = p_classroom_id) then raise exception 'CLASSROOM_NOT_FOUND' using errcode = '22023'; end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then raise exception 'SCORE_IMPORT_ENTRIES_REQUIRED' using errcode = '22023'; end if;
  if jsonb_array_length(p_entries) > 10000 then raise exception 'SCORE_IMPORT_TOO_LARGE' using errcode = '22023'; end if;
  for v_item in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'INVALID_SCORE_IMPORT_ENTRY' using errcode = '22023'; end if;
    begin
      v_assignment_id := nullif(btrim(v_item ->> 'assignment_id'), '')::uuid;
      v_student_id := nullif(btrim(v_item ->> 'student_id'), '')::uuid;
      v_status := btrim(coalesce(v_item ->> 'score_status', ''));
      v_raw_score := (v_item ->> 'raw_score')::numeric;
    exception when others then raise exception 'INVALID_SCORE_IMPORT_ENTRY' using errcode = '22023'; end;
    if v_assignment_id is null or v_student_id is null or v_status not in ('ungraded', 'scored', 'leave', 'expired', 'no_score') or v_raw_score is null then raise exception 'INVALID_SCORE_IMPORT_ENTRY' using errcode = '22023'; end if;
    v_pair_key := v_assignment_id::text || ':' || v_student_id::text;
    if v_pair_key = any(v_seen_pairs) then raise exception 'DUPLICATE_SCORE_IMPORT_ENTRY' using errcode = '22023'; end if;
    v_seen_pairs := array_append(v_seen_pairs, v_pair_key);
    select * into v_assignment from public.score_assignments where id = v_assignment_id and classroom_id = p_classroom_id;
    if not found then raise exception 'SCORE_IMPORT_ASSIGNMENT_NOT_IN_CLASSROOM' using errcode = '22023'; end if;
    select * into v_student from public.students where id = v_student_id and classroom_id = p_classroom_id;
    if not found then raise exception 'SCORE_IMPORT_STUDENT_NOT_IN_CLASSROOM' using errcode = '22023'; end if;
    if v_status = 'scored' then
      if v_raw_score < 0 or v_raw_score > v_assignment.raw_max then raise exception 'SCORE_IMPORT_SCORE_OUT_OF_RANGE' using errcode = '22023'; end if;
    else v_raw_score := 0;
    end if;
    insert into public.score_entries (assignment_id, student_id, student_code, score_status, raw_score, raw_max, final_score, final_max, source_type, source_id, updated_at)
    values (v_assignment.id, v_student.id, v_student.student_id, v_status, v_raw_score, v_assignment.raw_max,
      case when v_status = 'scored' then greatest(0, least(v_assignment.final_max, round((v_raw_score / v_assignment.raw_max) * v_assignment.final_max))) else 0 end,
      v_assignment.final_max, 'manual', null, now())
    on conflict (assignment_id, student_id) do update set
      student_code = excluded.student_code, score_status = excluded.score_status, raw_score = excluded.raw_score,
      raw_max = excluded.raw_max, final_score = excluded.final_score, final_max = excluded.final_max,
      source_type = excluded.source_type, source_id = excluded.source_id, updated_at = excluded.updated_at;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.import_score_entries(uuid, jsonb) from public, anon;
grant execute on function public.import_score_entries(uuid, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;

-- Append-only submission and review history for teacher and student profiles.
begin;
lock table public.submissions in share row exclusive mode;

create table if not exists public.submission_history (
  id uuid primary key default gen_random_uuid(), submission_id uuid not null,
  assignment_id uuid, classroom_id uuid, assignment_title text not null default '',
  classroom_name text not null default '', student_code text not null default '',
  student_name text not null default '', submission_kind text not null default 'individual'
    check (submission_kind in ('individual','group')),
  group_member_codes text[] not null default '{}', group_member_names text[] not null default '{}',
  event_type text not null check (event_type in (
    'baseline','submitted','reviewed','score_changed','status_changed','attachment_removed','deleted'
  )),
  before_state jsonb, after_state jsonb, attachment_name text not null default '',
  actor_id uuid, actor_name text not null default '',
  actor_type text not null check (actor_type in ('teacher','student','system','baseline')),
  submitted_at timestamptz, reviewed_at timestamptz,
  occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists submission_history_room_time_idx on public.submission_history(classroom_id,occurred_at desc,id desc);
create index if not exists submission_history_student_time_idx on public.submission_history(student_code,occurred_at desc,id desc);
create index if not exists submission_history_submission_time_idx on public.submission_history(submission_id,occurred_at desc,id desc);
create index if not exists submission_history_group_codes_idx on public.submission_history using gin(group_member_codes);
create unique index if not exists submission_history_baseline_idx on public.submission_history(submission_id) where event_type='baseline';

alter table public.submission_history enable row level security;
drop policy if exists "submission history own group or teacher" on public.submission_history;
create policy "submission history own group or teacher" on public.submission_history
for select to authenticated using (
  public.is_teacher() or student_code=public.current_student_code()
  or public.current_student_code()=any(group_member_codes)
);
revoke all on public.submission_history from public,anon,authenticated,service_role;
grant select on public.submission_history to authenticated,service_role;

create or replace function public.submission_history_snapshot(value public.submissions)
returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'status',value.status,'raw_score',value.raw_score,'raw_max',value.raw_max,
    'final_score',value.final_score,'final_max',value.final_max,
    'attachment_type',case when value.file_path is not null then 'file' when value.link_url is not null then 'link' else 'none' end,
    'file_deleted',value.file_deleted_at is not null
  );
$$;

create or replace function public.record_submission_history()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_submission public.submissions%rowtype; v_event_type text;
  v_before jsonb; v_after jsonb; v_classroom_name text;
  v_actor_name text; v_actor_role text;
begin
  if tg_op='INSERT' then
    v_submission:=new; v_event_type:='submitted'; v_after:=public.submission_history_snapshot(new);
  elsif tg_op='DELETE' then
    v_submission:=old; v_event_type:='deleted'; v_before:=public.submission_history_snapshot(old);
  else
    v_submission:=new; v_before:=public.submission_history_snapshot(old); v_after:=public.submission_history_snapshot(new);
    if new.status='ตรวจแล้ว' and old.status is distinct from new.status then v_event_type:='reviewed';
    elsif (old.raw_score,old.raw_max,old.final_score,old.final_max)
      is distinct from (new.raw_score,new.raw_max,new.final_score,new.final_max) then v_event_type:='score_changed';
    elsif old.file_path is not null and new.file_path is null and new.file_deleted_at is not null then v_event_type:='attachment_removed';
    elsif old.status is distinct from new.status then v_event_type:='status_changed';
    else return new;
    end if;
  end if;
  select display_name into v_classroom_name from public.classrooms where id=v_submission.classroom_id;
  select full_name,role into v_actor_name,v_actor_role from public.profiles where id=auth.uid();
  insert into public.submission_history(
    submission_id,assignment_id,classroom_id,assignment_title,classroom_name,
    student_code,student_name,submission_kind,group_member_codes,group_member_names,
    event_type,before_state,after_state,attachment_name,actor_id,actor_name,actor_type,
    submitted_at,reviewed_at
  ) values (
    v_submission.id,v_submission.assignment_id,v_submission.classroom_id,
    coalesce(v_submission.assignment_title,''),coalesce(v_classroom_name,''),
    coalesce(v_submission.student_code,''),coalesce(v_submission.student_name,''),
    coalesce(v_submission.submission_kind,'individual'),
    coalesce(v_submission.group_member_codes,array[]::text[]),coalesce(v_submission.group_member_names,array[]::text[]),
    v_event_type,v_before,v_after,coalesce(v_submission.original_file_name,''),
    auth.uid(),coalesce(v_actor_name,''),
    case when auth.uid() is null then 'system' when v_actor_role='teacher' then 'teacher' else 'student' end,
    v_submission.submitted_at,v_submission.reviewed_at
  );
  if tg_op='DELETE' then return old; end if; return new;
end;
$$;
revoke all on function public.submission_history_snapshot(public.submissions) from public,anon,authenticated,service_role;
revoke all on function public.record_submission_history() from public,anon,authenticated,service_role;

insert into public.submission_history(
  submission_id,assignment_id,classroom_id,assignment_title,classroom_name,
  student_code,student_name,submission_kind,group_member_codes,group_member_names,
  event_type,after_state,attachment_name,actor_name,actor_type,submitted_at,reviewed_at,occurred_at
)
select submission.id,submission.assignment_id,submission.classroom_id,
  coalesce(submission.assignment_title,''),coalesce(classroom.display_name,''),
  coalesce(submission.student_code,''),coalesce(submission.student_name,''),
  coalesce(submission.submission_kind,'individual'),coalesce(submission.group_member_codes,array[]::text[]),
  coalesce(submission.group_member_names,array[]::text[]),
  case when submission.status='ตรวจแล้ว' then 'reviewed' else 'baseline' end,
  public.submission_history_snapshot(submission),
  coalesce(submission.original_file_name,''),'','baseline',submission.submitted_at,submission.reviewed_at,
  coalesce(submission.reviewed_at,submission.submitted_at,clock_timestamp())
from public.submissions submission left join public.classrooms classroom on classroom.id=submission.classroom_id
where not exists(select 1 from public.submission_history history where history.submission_id=submission.id)
on conflict (submission_id) where event_type='baseline' do nothing;

drop trigger if exists submissions_record_history on public.submissions;
create trigger submissions_record_history after insert or update or delete on public.submissions
for each row execute function public.record_submission_history();
comment on table public.submission_history is
  'Append-only submission audit visible to teachers and the related student/group members.';
notify pgrst,'reload schema';
commit;

-- Append-only teacher score history. Existing scores are never rewritten.
begin;
-- Serialize installation/backfill with score writes, including direct upserts.
lock table public.score_entries in share row exclusive mode;

create table if not exists public.score_entry_history (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  assignment_id uuid not null,
  student_id uuid not null,
  classroom_id uuid,
  student_code text not null default '',
  student_name text not null default '',
  assignment_title text not null default '',
  classroom_name text not null default '',
  operation text not null check (operation in ('baseline','insert','update','delete')),
  before_score jsonb,
  after_score jsonb,
  actor_id uuid,
  actor_name text not null default '',
  actor_type text not null check (actor_type in ('teacher','user','system','baseline')),
  changed_at timestamptz not null default clock_timestamp(),
  constraint score_history_snapshots check (
    (operation in ('baseline','insert') and before_score is null and after_score is not null)
    or (operation='update' and before_score is not null and after_score is not null)
    or (operation='delete' and before_score is not null and after_score is null)
  )
);
-- No foreign keys: deleting an assignment, student or account must not erase history.
create index if not exists score_history_room_time_idx
  on public.score_entry_history(classroom_id,changed_at desc,id desc);
create index if not exists score_history_entry_time_idx
  on public.score_entry_history(entry_id,changed_at desc,id desc);
create index if not exists score_history_student_time_idx
  on public.score_entry_history(student_id,changed_at desc,id desc);
create unique index if not exists score_history_baseline_idx
  on public.score_entry_history(entry_id) where operation='baseline';

alter table public.score_entry_history enable row level security;
drop policy if exists "teachers read score history" on public.score_entry_history;
create policy "teachers read score history" on public.score_entry_history
for select to authenticated using (public.is_teacher());
revoke all on public.score_entry_history from public, anon, authenticated, service_role;
grant select on public.score_entry_history to authenticated;
grant select on public.score_entry_history to service_role;

create or replace function public.score_history_snapshot(value public.score_entries)
returns jsonb language sql immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'status',value.score_status,'raw_score',value.raw_score,'raw_max',value.raw_max,
    'final_score',value.final_score,'final_max',value.final_max
  );
$$;

create or replace function public.record_score_entry_history()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.score_entries%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_previous public.score_entry_history%rowtype;
  v_room uuid;
  v_student_name text;
  v_assignment_title text;
  v_classroom_name text;
  v_actor_name text;
  v_actor_role text;
begin
  if TG_OP <> 'INSERT' then v_before := public.score_history_snapshot(OLD); end if;
  if TG_OP <> 'DELETE' then v_after := public.score_history_snapshot(NEW); end if;
  if TG_OP='UPDATE' and v_before is not distinct from v_after
    and (OLD.assignment_id,OLD.student_id,OLD.student_code) is not distinct from
        (NEW.assignment_id,NEW.student_id,NEW.student_code) then
    return NEW;
  end if;
  if TG_OP='DELETE' then v_entry := OLD; else v_entry := NEW; end if;
  select * into v_previous from public.score_entry_history
    where entry_id=v_entry.id order by changed_at desc,id desc limit 1;
  select full_name into v_student_name from public.students where id=v_entry.student_id;
  select title,classroom_id into v_assignment_title,v_room
    from public.score_assignments where id=v_entry.assignment_id;
  v_room := coalesce(v_room,v_previous.classroom_id);
  select display_name into v_classroom_name from public.classrooms where id=v_room;
  select full_name,role into v_actor_name,v_actor_role from public.profiles where id=auth.uid();

  insert into public.score_entry_history (
    entry_id,assignment_id,student_id,classroom_id,student_code,student_name,
    assignment_title,classroom_name,operation,before_score,after_score,
    actor_id,actor_name,actor_type
  ) values (
    v_entry.id,v_entry.assignment_id,v_entry.student_id,v_room,coalesce(v_entry.student_code,''),
    coalesce(v_student_name,v_previous.student_name,''),
    coalesce(v_assignment_title,v_previous.assignment_title,''),
    coalesce(v_classroom_name,v_previous.classroom_name,''),
    lower(TG_OP),v_before,v_after,auth.uid(),coalesce(v_actor_name,''),
    case when auth.uid() is null then 'system' when v_actor_role='teacher' then 'teacher' else 'user' end
  );
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end;
$$;

revoke all on function public.score_history_snapshot(public.score_entries) from public,anon,authenticated,service_role;
revoke all on function public.record_score_entry_history() from public,anon,authenticated,service_role;

-- One baseline per existing entry, not fabricated past editing activity.
insert into public.score_entry_history (
  entry_id,assignment_id,student_id,classroom_id,student_code,student_name,
  assignment_title,classroom_name,operation,after_score,actor_name,actor_type
)
select e.id,e.assignment_id,e.student_id,a.classroom_id,coalesce(e.student_code,''),
  coalesce(s.full_name,''),coalesce(a.title,''),coalesce(c.display_name,''),
  'baseline',public.score_history_snapshot(e),'','baseline'
from public.score_entries e
left join public.students s on s.id=e.student_id
left join public.score_assignments a on a.id=e.assignment_id
left join public.classrooms c on c.id=a.classroom_id
where not exists (select 1 from public.score_entry_history h where h.entry_id=e.id)
on conflict (entry_id) where operation='baseline' do nothing;

drop trigger if exists score_entries_record_history on public.score_entries;
create trigger score_entries_record_history
after insert or update or delete on public.score_entries
for each row execute function public.record_score_entry_history();

comment on table public.score_entry_history is
'Append-only score change audit. Baselines reflect installation time, not historical edit time. Teacher read access only. No cascading deletion.';
notify pgrst,'reload schema';
commit;
\n+-- Transactional destructive actions, deferred storage cleanup and query indexes.
-- Safe to run repeatedly after the base schema and role helpers are installed.

begin;

create table if not exists public.storage_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null default 'classroom-files',
  object_path text not null,
  reason text not null default 'record_deleted',
  status text not null default 'pending' check (status in ('pending', 'completed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (bucket_id, object_path)
);

create index if not exists storage_cleanup_queue_pending_idx
  on public.storage_cleanup_queue (created_at, id)
  where status = 'pending';
create index if not exists students_classroom_order_idx
  on public.students (classroom_id, student_no, id);
create index if not exists score_assignments_classroom_order_idx
  on public.score_assignments (classroom_id, created_at, id);
create index if not exists score_entries_student_assignment_idx
  on public.score_entries (student_id, assignment_id);
create index if not exists submissions_classroom_review_idx
  on public.submissions (classroom_id, status, submitted_at desc, id);
create index if not exists submissions_student_time_idx
  on public.submissions (student_code, submitted_at desc, id);
create index if not exists materials_level_time_idx
  on public.materials (level, published_at desc, id);
create index if not exists announcements_classroom_time_idx
  on public.announcements (classroom_id, published_at desc, id);
create index if not exists material_download_logs_student_time_idx
  on public.material_download_logs (student_code, downloaded_at desc, id);
create index if not exists material_download_logs_classroom_time_idx
  on public.material_download_logs (classroom_id, downloaded_at desc, id);

alter table public.storage_cleanup_queue enable row level security;
revoke all on public.storage_cleanup_queue from public, anon, authenticated;
grant select, insert, update, delete on public.storage_cleanup_queue to service_role;

create or replace function public.enqueue_storage_cleanup(
  p_paths text[],
  p_reason text default 'record_deleted'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  insert into public.storage_cleanup_queue (bucket_id, object_path, reason, status, attempts, last_error, completed_at)
  select 'classroom-files', trim(path), left(coalesce(nullif(trim(p_reason), ''), 'record_deleted'), 120), 'pending', 0, null, null
  from unnest(coalesce(p_paths, array[]::text[])) path
  where nullif(trim(path), '') is not null
  on conflict (bucket_id, object_path) do update
  set reason = excluded.reason,
      status = 'pending',
      attempts = 0,
      last_error = null,
      completed_at = null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.enqueue_storage_cleanup(text[], text) from public, anon, authenticated, service_role;

create or replace function public.delete_material_with_cleanup(p_material_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_paths text[];
begin
  if not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  select array_remove(array[file_path, cover_path], null)
  into v_paths
  from public.materials
  where id = p_material_id
  for update;

  if not found then return false; end if;
  perform public.enqueue_storage_cleanup(v_paths, 'material_deleted');
  delete from public.materials where id = p_material_id;
  return true;
end;
$$;

create or replace function public.delete_submission_with_cleanup(p_submission_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_path text;
begin
  if not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  select file_path into v_path
  from public.submissions
  where id = p_submission_id
  for update;

  if not found then return false; end if;
  perform public.enqueue_storage_cleanup(array[v_path], 'submission_deleted');
  delete from public.submissions where id = p_submission_id;
  return true;
end;
$$;

create or replace function public.delete_worksheet_with_cleanup(p_worksheet_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_path text;
begin
  if not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  select file_path into v_path
  from public.worksheets
  where id = p_worksheet_id
  for update;

  if not found then return false; end if;
  perform public.enqueue_storage_cleanup(array[v_path], 'worksheet_deleted');
  delete from public.worksheets where id = p_worksheet_id;
  return true;
end;
$$;

create or replace function public.delete_classroom_with_cleanup(p_classroom_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_paths text[];
  v_file_count integer := 0;
begin
  if not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  select display_name into v_name
  from public.classrooms
  where id = p_classroom_id
  for update;
  if not found then
    raise exception 'CLASSROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(path), array[]::text[])
  into v_paths
  from (
    select file_path as path from public.materials where classroom_id = p_classroom_id
    union all
    select cover_path from public.materials where classroom_id = p_classroom_id
    union all
    select file_path from public.submissions where classroom_id = p_classroom_id
    union all
    select file_path from public.student_roster_uploads where classroom_id = p_classroom_id
  ) files
  where nullif(trim(path), '') is not null;

  v_file_count := public.enqueue_storage_cleanup(v_paths, 'classroom_deleted');

  delete from public.announcements where classroom_id = p_classroom_id;
  delete from public.material_download_logs where classroom_id = p_classroom_id;
  delete from public.materials where classroom_id = p_classroom_id;
  delete from public.submissions where classroom_id = p_classroom_id;
  delete from public.score_assignments where classroom_id = p_classroom_id;
  delete from public.students where classroom_id = p_classroom_id;
  delete from public.student_roster_uploads where classroom_id = p_classroom_id;
  delete from public.chat_messages where classroom_id = p_classroom_id;
  update public.student_home_cards
  set classroom_ids = array_remove(classroom_ids, p_classroom_id), updated_at = now()
  where p_classroom_id = any(classroom_ids);
  delete from public.classrooms where id = p_classroom_id;

  return jsonb_build_object(
    'ok', true,
    'classroom_id', p_classroom_id,
    'classroom_name', v_name,
    'queued_files', v_file_count
  );
end;
$$;

revoke all on function public.delete_material_with_cleanup(uuid) from public, anon;
revoke all on function public.delete_submission_with_cleanup(uuid) from public, anon;
revoke all on function public.delete_worksheet_with_cleanup(uuid) from public, anon;
revoke all on function public.delete_classroom_with_cleanup(uuid) from public, anon;
grant execute on function public.delete_material_with_cleanup(uuid) to authenticated;
grant execute on function public.delete_submission_with_cleanup(uuid) to authenticated;
grant execute on function public.delete_worksheet_with_cleanup(uuid) to authenticated;
grant execute on function public.delete_classroom_with_cleanup(uuid) to authenticated;

comment on table public.storage_cleanup_queue is
  'Server-processed retry queue for storage objects whose owning database records were deleted.';
comment on function public.delete_classroom_with_cleanup(uuid) is
  'Teacher-only transactional classroom deletion. Storage objects are queued for idempotent server cleanup.';

notify pgrst, 'reload schema';
commit;
\n+-- Bring teacher-managed feature settings and AI history under migrations.

begin;

create table if not exists public.ai_assistant_settings (
  id boolean primary key default true check (id),
  name text not null default 'ผู้ช่วย AI' check (length(trim(name)) between 1 and 60),
  student_enabled boolean not null default true,
  score_access boolean not null default true,
  tone text not null default 'friendly' check (tone in ('friendly','formal','coach')),
  answer_length text not null default 'balanced' check (answer_length in ('short','balanced','detailed')),
  instructions text not null default '' check (length(instructions) <= 4000),
  daily_student_limit integer not null default 0 check (daily_student_limit between 0 and 1000),
  daily_teacher_limit integer not null default 0 check (daily_teacher_limit between 0 and 2000),
  history_retention_days integer not null default 90 check (history_retention_days between 7 and 3650)
);
alter table public.ai_assistant_settings add column if not exists daily_student_limit integer not null default 0;
alter table public.ai_assistant_settings add column if not exists daily_teacher_limit integer not null default 0;
alter table public.ai_assistant_settings add column if not exists history_retention_days integer not null default 90;
insert into public.ai_assistant_settings (id) values (true) on conflict do nothing;
alter table public.ai_assistant_settings enable row level security;
revoke all on public.ai_assistant_settings from anon, authenticated;
grant select, update on public.ai_assistant_settings to authenticated;
grant all on public.ai_assistant_settings to service_role;
drop policy if exists ai_settings_read on public.ai_assistant_settings;
create policy ai_settings_read on public.ai_assistant_settings for select to authenticated using (true);
drop policy if exists ai_settings_teacher_update on public.ai_assistant_settings;
create policy ai_settings_teacher_update on public.ai_assistant_settings for update to authenticated using (public.is_teacher()) with check (public.is_teacher());

create table if not exists public.feature_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null check (length(trim(body)) between 1 and 4000),
  audience text not null default 'student' check (audience in ('student','teacher','all')),
  enabled boolean not null default false,
  display_frequency text not null default 'once' check (display_frequency in ('once','every_visit')),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.feature_updates add column if not exists display_frequency text not null default 'once';
create or replace function public.bump_feature_update_revision()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.revision := case when tg_op = 'INSERT' then 1 else old.revision + 1 end;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists feature_update_revision on public.feature_updates;
create trigger feature_update_revision before insert or update on public.feature_updates
for each row execute function public.bump_feature_update_revision();
alter table public.feature_updates enable row level security;
revoke all on public.feature_updates from anon, authenticated;
grant select, insert, update, delete on public.feature_updates to authenticated;
grant all on public.feature_updates to service_role;
drop policy if exists feature_updates_read on public.feature_updates;
create policy feature_updates_read on public.feature_updates for select to authenticated using (
  public.is_teacher() or (enabled and (audience = 'all' or audience = (select role from public.profiles where id = auth.uid())))
);
drop policy if exists feature_updates_teacher on public.feature_updates;
create policy feature_updates_teacher on public.feature_updates for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

create table if not exists public.feature_update_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  update_id uuid not null references public.feature_updates(id) on delete cascade,
  revision integer not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, update_id, revision)
);
alter table public.feature_update_receipts enable row level security;
revoke all on public.feature_update_receipts from anon, authenticated;
grant select, insert on public.feature_update_receipts to authenticated;
grant all on public.feature_update_receipts to service_role;
drop policy if exists feature_receipts_read on public.feature_update_receipts;
create policy feature_receipts_read on public.feature_update_receipts for select to authenticated using (user_id = auth.uid());
drop policy if exists feature_receipts_insert on public.feature_update_receipts;
create policy feature_receipts_insert on public.feature_update_receipts for insert to authenticated with check (
  user_id = auth.uid() and exists (
    select 1 from public.feature_updates update_item
    where update_item.id = update_id and update_item.revision = feature_update_receipts.revision and update_item.enabled
  )
);

create table if not exists public.ai_assistant_exchanges (
  id uuid primary key,
  conversation_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  author_role text not null check (author_role in ('teacher','student')),
  class_name text not null default '',
  question text not null check (char_length(question) between 1 and 6000),
  answer text not null default '',
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  error_message text not null default '',
  response_data jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists ai_assistant_exchanges_thread_idx
  on public.ai_assistant_exchanges (user_id, conversation_id, created_at desc);
create index if not exists ai_assistant_exchanges_recent_idx
  on public.ai_assistant_exchanges (created_at desc, id);
alter table public.ai_assistant_exchanges enable row level security;
revoke all on public.ai_assistant_exchanges from anon, authenticated;
grant select on public.ai_assistant_exchanges to authenticated;
grant all on public.ai_assistant_exchanges to service_role;
drop policy if exists "assistant history own or teacher" on public.ai_assistant_exchanges;
create policy "assistant history own or teacher" on public.ai_assistant_exchanges
for select to authenticated using (user_id = auth.uid() or public.is_teacher());

create table if not exists public.ai_assistant_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_date)
);
alter table public.ai_assistant_usage enable row level security;
revoke all on public.ai_assistant_usage from public, anon, authenticated;
grant all on public.ai_assistant_usage to service_role;

create or replace function public.claim_ai_assistant_request(p_user_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_limit integer;
  v_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  select case when profile.role = 'teacher' then settings.daily_teacher_limit else settings.daily_student_limit end
  into v_limit
  from public.profiles profile cross join public.ai_assistant_settings settings
  where profile.id = p_user_id and profile.role in ('teacher', 'student') and settings.id = true;
  if v_limit is null then raise exception 'PROFILE_REQUIRED'; end if;

  insert into public.ai_assistant_usage (user_id, usage_date, request_count)
  values (p_user_id, (now() at time zone 'Asia/Bangkok')::date, 1)
  on conflict (user_id, usage_date) do update
  set request_count = public.ai_assistant_usage.request_count + 1
  where v_limit = 0 or public.ai_assistant_usage.request_count < v_limit
  returning request_count into v_count;
  if v_count is null then raise exception 'AI_DAILY_LIMIT'; end if;
  return case when v_limit = 0 then -1 else v_limit - v_count end;
end;
$$;
revoke all on function public.claim_ai_assistant_request(uuid) from public, anon, authenticated;
grant execute on function public.claim_ai_assistant_request(uuid) to service_role;

-- Save a teacher's multi-work review as one transaction. If one item fails,
-- PostgreSQL rolls the whole call back so the score table cannot be half-saved.
create or replace function public.review_submissions_and_sync_scores(
  p_reviews jsonb
)
returns setof public.submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_review jsonb;
  v_submission_id uuid;
  v_raw_score numeric;
  v_raw_max numeric;
  v_final_max numeric;
  v_seen_ids uuid[] := array[]::uuid[];
  v_saved public.submissions%rowtype;
begin
  if not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;
  if p_reviews is null or jsonb_typeof(p_reviews) <> 'array' or jsonb_array_length(p_reviews) = 0 then
    raise exception 'REVIEWS_REQUIRED' using errcode = '22023';
  end if;
  if jsonb_array_length(p_reviews) > 100 then
    raise exception 'TOO_MANY_REVIEWS' using errcode = '22023';
  end if;

  for v_review in select value from jsonb_array_elements(p_reviews)
  loop
    if jsonb_typeof(v_review) <> 'object' then
      raise exception 'INVALID_REVIEW' using errcode = '22023';
    end if;
    begin
      v_submission_id := nullif(btrim(v_review ->> 'submission_id'), '')::uuid;
      v_raw_score := (v_review ->> 'raw_score')::numeric;
      v_raw_max := (v_review ->> 'raw_max')::numeric;
      v_final_max := (v_review ->> 'final_max')::numeric;
    exception when others then
      raise exception 'INVALID_REVIEW' using errcode = '22023';
    end;
    if v_submission_id is null or v_raw_score is null or v_raw_score < 0
      or v_raw_max is null or v_raw_max <= 0 or v_raw_score > v_raw_max
      or v_final_max is null or v_final_max <= 0 then
      raise exception 'INVALID_REVIEW_SCORE' using errcode = '22023';
    end if;
    if v_submission_id = any(v_seen_ids) then
      raise exception 'DUPLICATE_SUBMISSION' using errcode = '22023';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_submission_id);
    select * into v_saved from public.review_submission_and_sync_scores(
      v_submission_id, 'ตรวจแล้ว', v_raw_score, v_raw_max, v_final_max
    );
    return next v_saved;
  end loop;
end;
$$;
revoke all on function public.review_submissions_and_sync_scores(jsonb) from public, anon;
grant execute on function public.review_submissions_and_sync_scores(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
