-- Re-detect content bounds after a whole-document rotation. A crop saved for the
-- previous orientation can otherwise clip the opposite side of the page.
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
  if not found then
    raise exception 'WORKSHEET_NOT_FOUND' using errcode = '42501';
  end if;

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

revoke all on function public.rotate_all_worksheet_pages(uuid, smallint) from public, anon;
grant execute on function public.rotate_all_worksheet_pages(uuid, smallint) to authenticated;

notify pgrst, 'reload schema';
