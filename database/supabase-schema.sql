create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('teacher','student')),
  student_code text unique,
  class_name text,
  school_name text default 'โรงเรียนเทพศิรินทร์ นนทบุรี',
  created_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  unit text not null,
  level text not null,
  material_type text not null check (material_type in ('PDF','VIDEO','IMG')),
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
  class_name text not null default 'ม.1/1 - สังคมศึกษา',
  created_at timestamptz not null default now()
);

create table if not exists public.score_assignments (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  class_name text not null default 'ม.1/1 - สังคมศึกษา',
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
  assignment_title text not null,
  student_name text not null,
  student_code text not null,
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

create table if not exists public.student_roster_uploads (
  id uuid primary key default uuid_generate_v4(),
  class_name text not null,
  file_path text not null,
  file_name text not null,
  file_size integer not null,
  uploaded_at timestamptz not null default now()
);

alter table public.profiles add column if not exists school_name text default 'โรงเรียนเทพศิรินทร์ นนทบุรี';
alter table public.submissions add column if not exists raw_score numeric not null default 0 check (raw_score >= 0);
alter table public.submissions add column if not exists raw_max numeric not null default 10 check (raw_max > 0);
alter table public.submissions add column if not exists final_score numeric not null default 0 check (final_score >= 0);
alter table public.submissions add column if not exists final_max numeric not null default 10 check (final_max > 0);

insert into storage.buckets (id, name, public)
values ('classroom-files', 'classroom-files', false)
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.materials enable row level security;
alter table public.students enable row level security;
alter table public.score_assignments enable row level security;
alter table public.score_entries enable row level security;
alter table public.submissions enable row level security;
alter table public.scores enable row level security;
alter table public.student_roster_uploads enable row level security;

drop policy if exists "profiles can read own profile" on public.profiles;
create policy "profiles can read own profile" on public.profiles for select to authenticated using (auth.uid() = id);

drop policy if exists "classroom materials readable" on public.materials;
drop policy if exists "classroom materials insertable" on public.materials;
drop policy if exists "classroom materials updateable" on public.materials;
drop policy if exists "classroom materials deleteable" on public.materials;
create policy "classroom materials readable" on public.materials for select to authenticated using (true);
create policy "classroom materials insertable" on public.materials for insert to authenticated with check (true);
create policy "classroom materials updateable" on public.materials for update to authenticated using (true) with check (true);
create policy "classroom materials deleteable" on public.materials for delete to authenticated using (true);

drop policy if exists "students readable" on public.students;
drop policy if exists "students insertable" on public.students;
drop policy if exists "students updateable" on public.students;
drop policy if exists "students deleteable" on public.students;
create policy "students readable" on public.students for select to authenticated using (true);
create policy "students insertable" on public.students for insert to authenticated with check (true);
create policy "students updateable" on public.students for update to authenticated using (true) with check (true);
create policy "students deleteable" on public.students for delete to authenticated using (true);

drop policy if exists "score assignments readable" on public.score_assignments;
drop policy if exists "score assignments insertable" on public.score_assignments;
drop policy if exists "score assignments updateable" on public.score_assignments;
drop policy if exists "score assignments deleteable" on public.score_assignments;
create policy "score assignments readable" on public.score_assignments for select to authenticated using (true);
create policy "score assignments insertable" on public.score_assignments for insert to authenticated with check (true);
create policy "score assignments updateable" on public.score_assignments for update to authenticated using (true) with check (true);
create policy "score assignments deleteable" on public.score_assignments for delete to authenticated using (true);

drop policy if exists "score entries readable" on public.score_entries;
drop policy if exists "score entries insertable" on public.score_entries;
drop policy if exists "score entries updateable" on public.score_entries;
drop policy if exists "score entries deleteable" on public.score_entries;
create policy "score entries readable" on public.score_entries for select to authenticated using (true);
create policy "score entries insertable" on public.score_entries for insert to authenticated with check (true);
create policy "score entries updateable" on public.score_entries for update to authenticated using (true) with check (true);
create policy "score entries deleteable" on public.score_entries for delete to authenticated using (true);

drop policy if exists "submissions readable" on public.submissions;
drop policy if exists "submissions insertable" on public.submissions;
drop policy if exists "submissions updateable" on public.submissions;
drop policy if exists "submissions deleteable" on public.submissions;
create policy "submissions readable" on public.submissions for select to authenticated using (true);
create policy "submissions insertable" on public.submissions for insert to authenticated with check (true);
create policy "submissions updateable" on public.submissions for update to authenticated using (true) with check (true);
create policy "submissions deleteable" on public.submissions for delete to authenticated using (true);

drop policy if exists "scores readable" on public.scores;
drop policy if exists "scores insertable" on public.scores;
drop policy if exists "scores updateable" on public.scores;
create policy "scores readable" on public.scores for select to authenticated using (true);
create policy "scores insertable" on public.scores for insert to authenticated with check (true);
create policy "scores updateable" on public.scores for update to authenticated using (true) with check (true);

drop policy if exists "rosters insertable" on public.student_roster_uploads;
drop policy if exists "rosters readable" on public.student_roster_uploads;
create policy "rosters insertable" on public.student_roster_uploads for insert to authenticated with check (true);
create policy "rosters readable" on public.student_roster_uploads for select to authenticated using (true);

drop policy if exists "classroom files readable" on storage.objects;
drop policy if exists "classroom files uploadable" on storage.objects;
drop policy if exists "classroom files updateable" on storage.objects;
drop policy if exists "classroom files deleteable" on storage.objects;
create policy "classroom files readable" on storage.objects for select to authenticated using (bucket_id = 'classroom-files');
create policy "classroom files uploadable" on storage.objects for insert to authenticated with check (bucket_id = 'classroom-files');
create policy "classroom files updateable" on storage.objects for update to authenticated using (bucket_id = 'classroom-files') with check (bucket_id = 'classroom-files');
create policy "classroom files deleteable" on storage.objects for delete to authenticated using (bucket_id = 'classroom-files');
