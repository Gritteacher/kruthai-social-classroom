-- Count student views without allowing students to update material rows directly.

begin;

alter table public.materials
  add column if not exists view_count bigint not null default 0 check (view_count >= 0);

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
          and material.level = public.user_classroom_level()
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

commit;
