-- Make material access/view counting tolerant of equivalent grade-level labels.

begin;

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

create or replace function public.can_access_material_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_teacher() or exists (
    select 1
    from public.materials material
    where material.file_path = object_name
      and (
        material.classroom_id = public.user_classroom_id()
        or (
          material.classroom_id is null
          and public.material_level_matches(material.level, public.user_classroom_level())
        )
      )
  );
$$;

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

drop policy if exists "materials select related" on public.materials;
create policy "materials select related" on public.materials
for select to authenticated
using (
  public.is_teacher()
  or classroom_id = public.user_classroom_id()
  or (classroom_id is null and public.material_level_matches(level, public.user_classroom_level()))
);

drop policy if exists "download logs insert own" on public.material_download_logs;
create policy "download logs insert own" on public.material_download_logs
for insert to authenticated with check (
  student_code = public.current_student_code()
  and student_name = public.current_student_name()
  and exists (
    select 1 from public.materials material
    where material.id = material_download_logs.material_id
      and (
        material.classroom_id = public.user_classroom_id()
        or (
          material.classroom_id is null
          and public.material_level_matches(material.level, public.user_classroom_level())
        )
      )
  )
);

revoke all on function public.normalized_grade_level(text) from public;
revoke all on function public.material_level_matches(text, text) from public;
revoke all on function public.current_student_code() from public;
revoke all on function public.current_student_name() from public;
revoke all on function public.user_classroom_id() from public;
revoke all on function public.user_classroom_level() from public;
revoke all on function public.can_access_material_file(text) from public;
revoke all on function public.record_material_view(uuid) from public, anon;
grant execute on function public.normalized_grade_level(text) to authenticated;
grant execute on function public.material_level_matches(text, text) to authenticated;
grant execute on function public.current_student_code() to authenticated;
grant execute on function public.current_student_name() to authenticated;
grant execute on function public.user_classroom_id() to authenticated;
grant execute on function public.user_classroom_level() to authenticated;
grant execute on function public.can_access_material_file(text) to authenticated;
grant execute on function public.record_material_view(uuid) to authenticated;

commit;
