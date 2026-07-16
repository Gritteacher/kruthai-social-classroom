-- Add score assignment categories and allow editing them by assignment group.

begin;

alter table public.score_assignments
  add column if not exists assignment_type text not null default 'ทั่วไป';

update public.score_assignments
set assignment_type = 'ทั่วไป'
where nullif(trim(assignment_type), '') is null;

create or replace function public.update_score_assignment_group(
  p_assignment_group_id uuid,
  p_classroom_ids uuid[],
  p_title text,
  p_assignment_type text,
  p_raw_max numeric,
  p_final_max numeric
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
    final_max = p_final_max
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

revoke all on function public.update_score_assignment_group(uuid, uuid[], text, text, numeric, numeric) from public;
grant execute on function public.update_score_assignment_group(uuid, uuid[], text, text, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';

commit;
