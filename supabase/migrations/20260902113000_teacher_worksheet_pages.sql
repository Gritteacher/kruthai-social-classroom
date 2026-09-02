-- Private teacher worksheet copies and persisted page rotation.

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

create table if not exists public.worksheet_teacher_pages (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references public.worksheets (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  page_number integer not null check (page_number > 0),
  annotations jsonb not null default '[]'::jsonb,
  rotation smallint not null default 0 check (rotation in (0, 90, 180, 270)),
  updated_at timestamptz not null default now(),
  unique (worksheet_id, teacher_id, page_number),
  constraint worksheet_teacher_annotations_array_check
    check (jsonb_typeof(annotations) = 'array'),
  constraint worksheet_teacher_annotations_size_check
    check (octet_length(annotations::text) <= 1048576)
);

create index if not exists worksheet_teacher_pages_owner_idx
  on public.worksheet_teacher_pages (teacher_id, worksheet_id, page_number);

alter table public.worksheet_teacher_pages enable row level security;

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

revoke all on function public.save_worksheet_page(uuid, integer, jsonb, smallint, boolean) from public, anon;
grant execute on function public.save_worksheet_page(uuid, integer, jsonb, smallint, boolean) to authenticated;
revoke all on function public.save_teacher_worksheet_page(uuid, integer, jsonb, smallint) from public, anon;
grant execute on function public.save_teacher_worksheet_page(uuid, integer, jsonb, smallint) to authenticated;

grant select, insert, update, delete on public.worksheet_teacher_pages to authenticated;

notify pgrst, 'reload schema';
