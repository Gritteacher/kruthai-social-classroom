-- Online worksheets: classroom-scoped PDF templates and per-page student answers.

begin;

create table if not exists public.worksheets (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 180),
  description text not null default '',
  file_path text not null unique,
  original_file_name text not null,
  page_count integer not null check (page_count between 1 and 300),
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
  status text not null default 'draft' check (status in ('draft', 'submitted', 'returned', 'reviewed')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (worksheet_id, student_id, page_number),
  constraint worksheet_annotations_array_check check (jsonb_typeof(annotations) = 'array'),
  constraint worksheet_annotations_size_check check (octet_length(annotations::text) <= 1048576)
);

create index if not exists worksheet_classrooms_classroom_idx
  on public.worksheet_classrooms (classroom_id, worksheet_id);
create index if not exists worksheet_page_answers_student_idx
  on public.worksheet_page_answers (student_code, worksheet_id, page_number);
create index if not exists worksheet_page_answers_teacher_idx
  on public.worksheet_page_answers (worksheet_id, classroom_id, status, page_number);

alter table public.worksheets enable row level security;
alter table public.worksheet_classrooms enable row level security;
alter table public.worksheet_page_answers enable row level security;

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

create or replace function public.save_worksheet_page(
  p_worksheet_id uuid,
  p_page_number integer,
  p_annotations jsonb,
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
    page_number, annotations, status, submitted_at, updated_at
  ) values (
    v_worksheet.id, v_student.classroom_id, v_student.id, v_student.student_code, v_student.full_name,
    p_page_number, p_annotations, v_status, case when p_submit then now() else null end, now()
  )
  on conflict (worksheet_id, student_id, page_number) do update
  set annotations = excluded.annotations,
      status = excluded.status,
      submitted_at = case when p_submit then now() else worksheet_page_answers.submitted_at end,
      reviewed_at = null,
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

revoke all on function public.save_worksheet_page(uuid, integer, jsonb, boolean) from public, anon;
grant execute on function public.save_worksheet_page(uuid, integer, jsonb, boolean) to authenticated;
revoke all on function public.can_access_worksheet_file(text) from public, anon;
grant execute on function public.can_access_worksheet_file(text) to authenticated;

grant select, insert, update, delete on public.worksheets to authenticated;
grant select, insert, update, delete on public.worksheet_classrooms to authenticated;
grant select, update on public.worksheet_page_answers to authenticated;
revoke insert, delete on public.worksheet_page_answers from authenticated;

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

commit;
