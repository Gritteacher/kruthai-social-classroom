begin;

lock table public.score_assignments in share row exclusive mode;
lock table public.score_entries in share row exclusive mode;
lock table public.submissions in share row exclusive mode;

do $migration$
declare
  target_group constant uuid := '5159b258-12a2-452b-91cb-384e861ee71c';
  duplicate_supply_group constant uuid := '045f1ca6-c980-4785-ac47-bd1bb57141f7';
  canonical_supply_group constant uuid := '77455eef-c907-4387-80a9-12d04efb7a99';
  target_assignment_count integer;
  target_classroom_count integer;
  target_student_count integer;
  target_entry_count integer;
begin
  select count(*), count(distinct classroom_id)
  into target_assignment_count, target_classroom_count
  from public.score_assignments
  where assignment_group_id = target_group;

  -- New installations do not contain this production classroom data.
  if target_assignment_count = 0 then
    return;
  end if;

  if target_assignment_count <> 7 or target_classroom_count <> 7 then
    raise exception 'ECON_TARGET_ASSIGNMENTS_CHANGED:%:%', target_assignment_count, target_classroom_count;
  end if;

  if exists (
    select 1
    from public.score_assignments
    where assignment_group_id = target_group
      and (
        title <> 'วันเงินตราวินาศ'
        or class_name not like '%Econ%'
        or raw_max <> 10
        or final_max not in (2, 3)
      )
  ) then
    raise exception 'ECON_TARGET_ASSIGNMENT_VALUES_CHANGED';
  end if;

  if exists (
    select 1
    from public.score_assignments
    where assignment_group_id = duplicate_supply_group
      and (title <> 'อุปทาน 2' or class_name <> 'ม.6 ห้อง 2 - Econ')
  ) then
    raise exception 'ECON_DUPLICATE_SUPPLY_GROUP_CHANGED';
  end if;

  if exists (
    select 1
    from public.score_assignments
    where assignment_group_id = canonical_supply_group
      and (title <> 'อุปทาน 2' or class_name not like '%Econ%')
  ) then
    raise exception 'ECON_CANONICAL_SUPPLY_GROUP_CHANGED';
  end if;

  -- This only repairs grouping metadata. It does not alter any earlier score.
  update public.score_assignments
  set assignment_group_id = canonical_supply_group
  where assignment_group_id = duplicate_supply_group
    and title = 'อุปทาน 2'
    and class_name = 'ม.6 ห้อง 2 - Econ';

  if (
    select count(distinct assignment_group_id)
    from public.score_assignments
    where title = 'อุปทาน 2'
      and class_name like '%Econ%'
  ) <> 1 then
    raise exception 'ECON_SUPPLY_GROUP_MERGE_FAILED';
  end if;

  update public.score_assignments
  set final_max = 3
  where assignment_group_id = target_group;

  insert into public.score_entries (
    assignment_id,
    student_id,
    student_code,
    score_status,
    raw_score,
    raw_max,
    final_score,
    final_max,
    updated_at
  )
  select
    assignment.id,
    student.id,
    student.student_code,
    'scored',
    10,
    10,
    3,
    3,
    now()
  from public.score_assignments assignment
  join public.students student on student.classroom_id = assignment.classroom_id
  where assignment.assignment_group_id = target_group
  on conflict (assignment_id, student_id) do update
  set
    student_code = excluded.student_code,
    score_status = 'scored',
    raw_score = 10,
    raw_max = 10,
    final_score = 3,
    final_max = 3,
    updated_at = now();

  update public.submissions submission
  set
    status = 'ตรวจแล้ว',
    raw_score = 10,
    raw_max = 10,
    final_score = 3,
    final_max = 3,
    reviewed_at = coalesce(submission.reviewed_at, now())
  where submission.assignment_id in (
    select assignment.id
    from public.score_assignments assignment
    where assignment.assignment_group_id = target_group
  );

  select count(*)
  into target_student_count
  from public.students student
  where student.classroom_id in (
    select assignment.classroom_id
    from public.score_assignments assignment
    where assignment.assignment_group_id = target_group
  );

  select count(*)
  into target_entry_count
  from public.score_entries entry
  join public.score_assignments assignment on assignment.id = entry.assignment_id
  where assignment.assignment_group_id = target_group
    and entry.score_status = 'scored'
    and entry.raw_score = 10
    and entry.raw_max = 10
    and entry.final_score = 3
    and entry.final_max = 3;

  if target_entry_count <> target_student_count then
    raise exception 'ECON_FULL_SCORE_COUNT_MISMATCH:%:%', target_entry_count, target_student_count;
  end if;

  if exists (
    select 1
    from public.score_assignments assignment
    where assignment.classroom_id in (
      select target.classroom_id
      from public.score_assignments target
      where target.assignment_group_id = target_group
    )
    group by assignment.classroom_id
    having sum(assignment.final_max) <> 100
  ) then
    raise exception 'ECON_CLASSROOM_TOTAL_NOT_100';
  end if;
end
$migration$;

commit;
