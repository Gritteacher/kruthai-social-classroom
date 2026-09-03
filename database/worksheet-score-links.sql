-- Run this focused patch in the Supabase SQL editor.
-- It links worksheet pages to score-assignment groups and is safe to run again.

alter table public.score_entries add column if not exists source_type text;
alter table public.score_entries add column if not exists source_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'score_entries_source_type_check'
      and conrelid = 'public.score_entries'::regclass
  ) then
    alter table public.score_entries
      add constraint score_entries_source_type_check
      check (source_type is null or source_type in ('manual', 'submission', 'worksheet'));
  end if;
end;
$$;

create table if not exists public.worksheet_score_links (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references public.worksheets (id) on delete cascade,
  page_number integer not null check (page_number > 0),
  assignment_group_id uuid not null,
  page_max_score numeric not null check (page_max_score > 0),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worksheet_id, page_number, assignment_group_id)
);

create table if not exists public.worksheet_page_grades (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.worksheet_page_answers (id) on delete cascade,
  score_link_id uuid not null references public.worksheet_score_links (id) on delete restrict,
  score numeric not null check (score >= 0),
  feedback text not null default '',
  graded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  graded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (answer_id, score_link_id)
);

create index if not exists worksheet_score_links_worksheet_page_idx
  on public.worksheet_score_links (worksheet_id, page_number, sort_order);
create index if not exists worksheet_score_links_group_idx
  on public.worksheet_score_links (assignment_group_id, worksheet_id);
create index if not exists worksheet_page_grades_answer_idx
  on public.worksheet_page_grades (answer_id, score_link_id);
create index if not exists worksheet_page_grades_link_idx
  on public.worksheet_page_grades (score_link_id, answer_id);

alter table public.worksheet_score_links enable row level security;
alter table public.worksheet_page_grades enable row level security;

drop policy if exists "worksheet score links select related" on public.worksheet_score_links;
drop policy if exists "worksheet score links insert teacher" on public.worksheet_score_links;
drop policy if exists "worksheet score links update teacher" on public.worksheet_score_links;
drop policy if exists "worksheet score links delete teacher" on public.worksheet_score_links;
create policy "worksheet score links select related" on public.worksheet_score_links
for select to authenticated using (
  public.is_teacher()
  or exists (
    select 1
    from public.worksheet_classrooms classroom_link
    where classroom_link.worksheet_id = worksheet_score_links.worksheet_id
      and classroom_link.classroom_id = public.user_classroom_id()
  )
);
create policy "worksheet score links insert teacher" on public.worksheet_score_links
for insert to authenticated with check (public.is_teacher());
create policy "worksheet score links update teacher" on public.worksheet_score_links
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "worksheet score links delete teacher" on public.worksheet_score_links
for delete to authenticated using (public.is_teacher());

drop policy if exists "worksheet page grades select own or teacher" on public.worksheet_page_grades;
drop policy if exists "worksheet page grades insert teacher" on public.worksheet_page_grades;
drop policy if exists "worksheet page grades update teacher" on public.worksheet_page_grades;
drop policy if exists "worksheet page grades delete teacher" on public.worksheet_page_grades;
create policy "worksheet page grades select own or teacher" on public.worksheet_page_grades
for select to authenticated using (
  public.is_teacher()
  or exists (
    select 1
    from public.worksheet_page_answers answer
    where answer.id = worksheet_page_grades.answer_id
      and answer.student_code = public.current_student_code()
  )
);
create policy "worksheet page grades insert teacher" on public.worksheet_page_grades
for insert to authenticated with check (public.is_teacher());
create policy "worksheet page grades update teacher" on public.worksheet_page_grades
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "worksheet page grades delete teacher" on public.worksheet_page_grades
for delete to authenticated using (public.is_teacher());

create or replace function public.replace_worksheet_page_score_links(
  p_worksheet_id uuid,
  p_page_number integer,
  p_links jsonb
)
returns setof public.worksheet_score_links
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_worksheet public.worksheets%rowtype;
  v_item jsonb;
  v_group_id uuid;
  v_page_max numeric;
  v_sort_order integer;
  v_group_ids uuid[] := array[]::uuid[];
  v_room_count integer;
  v_group_room_count integer;
  v_assignment_raw_max numeric;
  v_other_page_total numeric;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;
  if p_links is null or jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) > 100 then
    raise exception 'INVALID_WORKSHEET_SCORE_LINKS' using errcode = '22023';
  end if;

  select * into v_worksheet
  from public.worksheets
  where id = p_worksheet_id
  for update;
  if not found then raise exception 'WORKSHEET_NOT_FOUND' using errcode = '22023'; end if;
  if p_page_number < 1 or p_page_number > v_worksheet.page_count then
    raise exception 'INVALID_WORKSHEET_PAGE' using errcode = '22023';
  end if;

  select count(*) into v_room_count
  from public.worksheet_classrooms
  where worksheet_id = p_worksheet_id;
  if v_room_count = 0 then raise exception 'WORKSHEET_CLASSROOM_REQUIRED' using errcode = '22023'; end if;

  for v_item in select value from jsonb_array_elements(p_links)
  loop
    begin
      if jsonb_typeof(v_item -> 'assignment_group_id') <> 'string'
        or jsonb_typeof(v_item -> 'page_max_score') <> 'number'
      then
        raise exception 'INVALID_WORKSHEET_SCORE_LINK';
      end if;
      v_group_id := (v_item ->> 'assignment_group_id')::uuid;
      v_page_max := (v_item ->> 'page_max_score')::numeric;
      v_sort_order := greatest(0, coalesce((v_item ->> 'sort_order')::integer, 0));
    exception when others then
      raise exception 'INVALID_WORKSHEET_SCORE_LINK' using errcode = '22023';
    end;

    if v_page_max <= 0 then
      raise exception 'INVALID_WORKSHEET_PAGE_MAX' using errcode = '22023';
    end if;
    if v_group_id = any(v_group_ids) then
      raise exception 'DUPLICATE_WORKSHEET_SCORE_LINK' using errcode = '22023';
    end if;

    select count(distinct assignment.classroom_id), min(assignment.raw_max)
    into v_group_room_count, v_assignment_raw_max
    from public.score_assignments assignment
    join public.worksheet_classrooms classroom_link
      on classroom_link.worksheet_id = p_worksheet_id
      and classroom_link.classroom_id = assignment.classroom_id
    where assignment.assignment_group_id = v_group_id;

    if v_group_room_count <> v_room_count or v_assignment_raw_max is null then
      raise exception 'ASSIGNMENT_GROUP_MISSING_CLASSROOM' using errcode = '22023';
    end if;

    select coalesce(sum(link.page_max_score), 0)
    into v_other_page_total
    from public.worksheet_score_links link
    where link.worksheet_id = p_worksheet_id
      and link.assignment_group_id = v_group_id
      and link.page_number <> p_page_number;

    if v_other_page_total + v_page_max > v_assignment_raw_max then
      raise exception 'WORKSHEET_LINK_TOTAL_EXCEEDS_ASSIGNMENT_MAX:%', v_assignment_raw_max
        using errcode = '22023';
    end if;

    v_group_ids := array_append(v_group_ids, v_group_id);

    insert into public.worksheet_score_links (
      worksheet_id, page_number, assignment_group_id, page_max_score,
      sort_order, created_by, created_at, updated_at
    ) values (
      p_worksheet_id, p_page_number, v_group_id, v_page_max,
      v_sort_order, auth.uid(), now(), now()
    )
    on conflict (worksheet_id, page_number, assignment_group_id) do update
    set page_max_score = excluded.page_max_score,
        sort_order = excluded.sort_order,
        updated_at = now();
  end loop;

  if exists (
    select 1
    from public.worksheet_score_links link
    where link.worksheet_id = p_worksheet_id
      and link.page_number = p_page_number
      and not (link.assignment_group_id = any(v_group_ids))
      and exists (
        select 1 from public.worksheet_page_grades grade
        where grade.score_link_id = link.id
      )
  ) then
    raise exception 'WORKSHEET_LINK_HAS_GRADES' using errcode = '22023';
  end if;

  delete from public.worksheet_score_links link
  where link.worksheet_id = p_worksheet_id
    and link.page_number = p_page_number
    and not (link.assignment_group_id = any(v_group_ids));

  return query
  select link.*
  from public.worksheet_score_links link
  where link.worksheet_id = p_worksheet_id
  order by link.page_number, link.sort_order, link.created_at, link.id;
end;
$$;

create or replace function public.grade_worksheet_pages_and_sync_scores(
  p_answer_ids uuid[],
  p_grades jsonb
)
returns setof public.worksheet_page_answers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_answer_id uuid;
  v_score_link_id uuid;
  v_score numeric;
  v_answer public.worksheet_page_answers%rowtype;
  v_link public.worksheet_score_links%rowtype;
  v_assignment public.score_assignments%rowtype;
  v_target record;
  v_raw_score numeric;
  v_final_score numeric;
  v_answer_count integer;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_answer_ids), 0) = 0
    or cardinality(p_answer_ids) > 100
    or array_position(p_answer_ids, null) is not null
  then
    raise exception 'WORKSHEET_ANSWERS_REQUIRED' using errcode = '22023';
  end if;
  if p_grades is null or jsonb_typeof(p_grades) <> 'array' or jsonb_array_length(p_grades) > 500 then
    raise exception 'INVALID_WORKSHEET_GRADES' using errcode = '22023';
  end if;

  select count(*) into v_answer_count
  from public.worksheet_page_answers answer
  where answer.id = any(p_answer_ids)
    and answer.status in ('submitted', 'reviewed');
  if v_answer_count <> cardinality(p_answer_ids) then
    raise exception 'WORKSHEET_ANSWER_NOT_REVIEWABLE' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_grades)
  loop
    begin
      if jsonb_typeof(v_item -> 'answer_id') <> 'string'
        or jsonb_typeof(v_item -> 'score_link_id') <> 'string'
        or jsonb_typeof(v_item -> 'score') <> 'number'
      then
        raise exception 'INVALID_WORKSHEET_GRADE';
      end if;
      v_answer_id := (v_item ->> 'answer_id')::uuid;
      v_score_link_id := (v_item ->> 'score_link_id')::uuid;
      v_score := (v_item ->> 'score')::numeric;
    exception when others then
      raise exception 'INVALID_WORKSHEET_GRADE' using errcode = '22023';
    end;

    if not (v_answer_id = any(p_answer_ids)) then
      raise exception 'WORKSHEET_GRADE_OUTSIDE_SELECTION' using errcode = '22023';
    end if;

    select * into v_answer
    from public.worksheet_page_answers answer
    where answer.id = v_answer_id
    for update;

    select * into v_link
    from public.worksheet_score_links link
    where link.id = v_score_link_id
      and link.worksheet_id = v_answer.worksheet_id
      and link.page_number = v_answer.page_number;
    if not found then raise exception 'WORKSHEET_SCORE_LINK_NOT_FOUND' using errcode = '22023'; end if;
    if v_score < 0 or v_score > v_link.page_max_score then
      raise exception 'WORKSHEET_SCORE_OUT_OF_RANGE' using errcode = '22023';
    end if;

    insert into public.worksheet_page_grades (
      answer_id, score_link_id, score, feedback, graded_by, graded_at, updated_at
    ) values (
      v_answer_id, v_score_link_id, v_score,
      coalesce(v_item ->> 'feedback', ''), auth.uid(), now(), now()
    )
    on conflict (answer_id, score_link_id) do update
    set score = excluded.score,
        feedback = excluded.feedback,
        graded_by = auth.uid(),
        graded_at = now(),
        updated_at = now();
  end loop;

  if exists (
    select 1
    from public.worksheet_page_answers answer
    join public.worksheet_score_links link
      on link.worksheet_id = answer.worksheet_id
      and link.page_number = answer.page_number
    where answer.id = any(p_answer_ids)
      and not exists (
        select 1
        from public.worksheet_page_grades grade
        where grade.answer_id = answer.id
          and grade.score_link_id = link.id
      )
  ) then
    raise exception 'WORKSHEET_GRADE_REQUIRED' using errcode = '22023';
  end if;

  update public.worksheet_page_answers answer
  set status = 'reviewed', reviewed_at = now(), updated_at = now()
  where answer.id = any(p_answer_ids);

  for v_target in
    select distinct
      answer.student_id,
      answer.student_code,
      answer.classroom_id,
      link.assignment_group_id
    from public.worksheet_page_answers answer
    join public.worksheet_score_links link
      on link.worksheet_id = answer.worksheet_id
      and link.page_number = answer.page_number
    where answer.id = any(p_answer_ids)
  loop
    select * into v_assignment
    from public.score_assignments assignment
    where assignment.assignment_group_id = v_target.assignment_group_id
      and assignment.classroom_id = v_target.classroom_id
    order by assignment.created_at, assignment.id
    limit 1;
    if not found then raise exception 'ASSIGNMENT_NOT_FOUND_FOR_WORKSHEET' using errcode = '22023'; end if;

    select coalesce(sum(grade.score), 0)
    into v_raw_score
    from public.worksheet_page_grades grade
    join public.worksheet_page_answers answer on answer.id = grade.answer_id
    join public.worksheet_score_links link on link.id = grade.score_link_id
    where answer.student_id = v_target.student_id
      and answer.classroom_id = v_target.classroom_id
      and answer.status = 'reviewed'
      and link.assignment_group_id = v_target.assignment_group_id;

    v_raw_score := greatest(0, least(v_assignment.raw_max, v_raw_score));
    v_final_score := greatest(
      0,
      least(v_assignment.final_max, round((v_raw_score / v_assignment.raw_max) * v_assignment.final_max))
    );

    insert into public.score_entries (
      assignment_id, student_id, student_code, score_status,
      raw_score, raw_max, final_score, final_max,
      source_type, source_id, updated_at
    ) values (
      v_assignment.id, v_target.student_id, v_target.student_code, 'scored',
      v_raw_score, v_assignment.raw_max, v_final_score, v_assignment.final_max,
      'worksheet', v_target.assignment_group_id, now()
    )
    on conflict (assignment_id, student_id) do update
    set student_code = excluded.student_code,
        score_status = excluded.score_status,
        raw_score = excluded.raw_score,
        raw_max = excluded.raw_max,
        final_score = excluded.final_score,
        final_max = excluded.final_max,
        source_type = excluded.source_type,
        source_id = excluded.source_id,
        updated_at = now();
  end loop;

  return query
  select answer.*
  from public.worksheet_page_answers answer
  where answer.id = any(p_answer_ids)
  order by answer.student_name, answer.page_number, answer.id;
end;
$$;

create or replace function public.return_worksheet_pages(p_answer_ids uuid[])
returns setof public.worksheet_page_answers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_answer_count integer;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_answer_ids), 0) = 0
    or cardinality(p_answer_ids) > 100
    or array_position(p_answer_ids, null) is not null
  then
    raise exception 'WORKSHEET_ANSWERS_REQUIRED' using errcode = '22023';
  end if;

  select count(*) into v_answer_count
  from public.worksheet_page_answers answer
  where answer.id = any(p_answer_ids)
    and answer.status = 'submitted';
  if v_answer_count <> cardinality(p_answer_ids) then
    raise exception 'WORKSHEET_ANSWER_NOT_RETURNABLE' using errcode = '22023';
  end if;

  return query
  update public.worksheet_page_answers answer
  set status = 'returned', reviewed_at = null, updated_at = now()
  where answer.id = any(p_answer_ids)
  returning answer.*;
end;
$$;

revoke all on function public.replace_worksheet_page_score_links(uuid, integer, jsonb) from public, anon;
grant execute on function public.replace_worksheet_page_score_links(uuid, integer, jsonb) to authenticated;
revoke all on function public.grade_worksheet_pages_and_sync_scores(uuid[], jsonb) from public, anon;
grant execute on function public.grade_worksheet_pages_and_sync_scores(uuid[], jsonb) to authenticated;
revoke all on function public.return_worksheet_pages(uuid[]) from public, anon;
grant execute on function public.return_worksheet_pages(uuid[]) to authenticated;

grant select, insert, update, delete on public.worksheet_score_links to authenticated;
grant select, insert, update, delete on public.worksheet_page_grades to authenticated;

comment on table public.worksheet_score_links
is 'Maps one worksheet page to one or more classroom-independent score-assignment groups.';
comment on table public.worksheet_page_grades
is 'Stores each student page score before synchronizing the aggregate into score_entries.';

notify pgrst, 'reload schema';
