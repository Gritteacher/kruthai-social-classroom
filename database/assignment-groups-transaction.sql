-- Run this patch once in the Supabase SQL editor.
-- It is safe to run again.

create extension if not exists "uuid-ossp";

alter table public.score_assignments
  add column if not exists assignment_group_id uuid;

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

alter table public.score_assignments
  alter column assignment_group_id set default uuid_generate_v4();
alter table public.score_assignments
  alter column assignment_group_id set not null;

create index if not exists score_assignments_group_id_idx
  on public.score_assignments (assignment_group_id);

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'teacher'
  );
$$;

revoke all on function public.is_teacher() from public;
grant execute on function public.is_teacher() to authenticated;

create or replace function public.update_score_assignment_group(
  p_assignment_group_id uuid,
  p_classroom_ids uuid[],
  p_title text,
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
  set title = trim(p_title), raw_max = p_raw_max, final_max = p_final_max
  where id = any(selected_assignment_ids);

  update public.score_entries
  set
    raw_max = p_raw_max,
    final_score = round((raw_score / p_raw_max) * p_final_max, 2),
    final_max = p_final_max,
    updated_at = now()
  where assignment_id = any(selected_assignment_ids);

  update public.submissions
  set
    assignment_title = trim(p_title),
    raw_max = p_raw_max,
    final_score = round((raw_score / p_raw_max) * p_final_max, 2),
    final_max = p_final_max
  where assignment_id = any(selected_assignment_ids);

  return query
  select assignment.*
  from public.score_assignments assignment
  where assignment.id = any(selected_assignment_ids)
  order by assignment.created_at, assignment.id;
end;
$$;

revoke all on function public.update_score_assignment_group(uuid, uuid[], text, numeric, numeric) from public;
grant execute on function public.update_score_assignment_group(uuid, uuid[], text, numeric, numeric) to authenticated;

comment on function public.update_score_assignment_group(uuid, uuid[], text, numeric, numeric)
is 'Atomically updates selected classrooms in one score-assignment group and recalculates related scores.';
