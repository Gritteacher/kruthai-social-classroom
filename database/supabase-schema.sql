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

drop policy if exists "classrooms readable" on public.classrooms;
drop policy if exists "classrooms insertable" on public.classrooms;
drop policy if exists "classrooms updateable" on public.classrooms;
drop policy if exists "classrooms deleteable" on public.classrooms;
create policy "classrooms readable" on public.classrooms for select to authenticated using (true);
create policy "classrooms insertable" on public.classrooms for insert to authenticated with check (true);
create policy "classrooms updateable" on public.classrooms for update to authenticated using (true) with check (true);
create policy "classrooms deleteable" on public.classrooms for delete to authenticated using (true);

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

drop policy if exists "announcements readable" on public.announcements;
drop policy if exists "announcements insertable" on public.announcements;
drop policy if exists "announcements updateable" on public.announcements;
drop policy if exists "announcements deleteable" on public.announcements;
create policy "announcements readable" on public.announcements for select to authenticated using (true);
create policy "announcements insertable" on public.announcements for insert to authenticated with check (true);
create policy "announcements updateable" on public.announcements for update to authenticated using (true) with check (true);
create policy "announcements deleteable" on public.announcements for delete to authenticated using (true);

drop policy if exists "rosters insertable" on public.student_roster_uploads;
drop policy if exists "rosters readable" on public.student_roster_uploads;
create policy "rosters insertable" on public.student_roster_uploads for insert to authenticated with check (true);
create policy "rosters readable" on public.student_roster_uploads for select to authenticated using (true);

drop policy if exists "material download logs readable" on public.material_download_logs;
drop policy if exists "material download logs insertable" on public.material_download_logs;
create policy "material download logs readable" on public.material_download_logs for select to authenticated using (true);
create policy "material download logs insertable" on public.material_download_logs for insert to authenticated with check (true);

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

  if coalesce(v_caller_role, '') <> 'teacher' then
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
grant execute on function public.create_student_account(uuid, text, text, text, uuid, text) to authenticated;

drop policy if exists "classroom files readable" on storage.objects;
drop policy if exists "classroom files uploadable" on storage.objects;
drop policy if exists "classroom files updateable" on storage.objects;
drop policy if exists "classroom files deleteable" on storage.objects;
create policy "classroom files readable" on storage.objects for select to authenticated using (bucket_id = 'classroom-files');
create policy "classroom files uploadable" on storage.objects for insert to authenticated with check (bucket_id = 'classroom-files');
create policy "classroom files updateable" on storage.objects for update to authenticated using (bucket_id = 'classroom-files') with check (bucket_id = 'classroom-files');
create policy "classroom files deleteable" on storage.objects for delete to authenticated using (bucket_id = 'classroom-files');
