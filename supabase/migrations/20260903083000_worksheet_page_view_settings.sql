-- Shared PDF orientation and crop settings, controlled by teachers.

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

  select * into v_worksheet
  from public.worksheets
  where id = p_worksheet_id
  for update;
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
        jsonb_build_object(
          'rotation', p_rotation,
          'crop', v_crop,
          'updatedAt', now()
        ),
        true
      ),
      updated_at = now()
  where id = p_worksheet_id
  returning *;
end;
$$;

revoke all on function public.update_worksheet_page_view(uuid, integer, smallint, jsonb) from public, anon;
grant execute on function public.update_worksheet_page_view(uuid, integer, smallint, jsonb) to authenticated;

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
  v_crop jsonb;
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
    v_crop := coalesce(
      v_settings -> v_page::text -> 'crop',
      '{"x":0,"y":0,"width":1,"height":1}'::jsonb
    );
    v_settings := jsonb_set(
      v_settings,
      array[v_page::text],
      jsonb_build_object(
        'rotation', v_rotation,
        'crop', v_crop,
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

revoke all on function public.rotate_all_worksheet_pages(uuid, smallint) from public, anon;
grant execute on function public.rotate_all_worksheet_pages(uuid, smallint) to authenticated;

notify pgrst, 'reload schema';
