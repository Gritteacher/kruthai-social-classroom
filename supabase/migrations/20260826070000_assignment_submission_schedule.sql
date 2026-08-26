-- Allow teachers to control when each score assignment accepts submissions.

begin;

alter table public.score_assignments
  add column if not exists accepting_submissions boolean not null default true;
alter table public.score_assignments
  add column if not exists submission_open_at timestamptz;
alter table public.score_assignments
  add column if not exists submission_close_at timestamptz;

alter table public.score_assignments
  drop constraint if exists score_assignments_submission_window_check;
alter table public.score_assignments
  add constraint score_assignments_submission_window_check
  check (
    submission_open_at is null
    or submission_close_at is null
    or submission_open_at < submission_close_at
  );

create or replace function public.submit_assignment_work(
  p_assignment_id uuid,
  p_file_path text default null,
  p_link_url text default null,
  p_member_codes text[] default null
)
returns setof public.submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_code text := public.current_student_code();
  v_student_name text := public.current_student_name();
  v_classroom_id uuid := public.user_classroom_id();
  v_assignment public.score_assignments%rowtype;
  v_member_codes text[];
  v_member_names text[];
  v_file_path text := nullif(trim(coalesce(p_file_path, '')), '');
  v_link_url text := nullif(trim(coalesce(p_link_url, '')), '');
begin
  if auth.uid() is null or v_student_code is null or v_student_name is null or v_classroom_id is null then
    raise exception 'ไม่พบบัญชีนักเรียนหรือห้องเรียน';
  end if;

  select * into v_assignment
  from public.score_assignments
  where id = p_assignment_id and classroom_id = v_classroom_id;
  if not found then raise exception 'ไม่พบงานในห้องเรียนของนักเรียน'; end if;

  if not v_assignment.accepting_submissions then
    raise exception 'ASSIGNMENT_SUBMISSIONS_CLOSED' using errcode = '22023';
  end if;
  if v_assignment.submission_open_at is not null and now() < v_assignment.submission_open_at then
    raise exception 'ASSIGNMENT_SUBMISSIONS_NOT_OPEN' using errcode = '22023';
  end if;
  if v_assignment.submission_close_at is not null and now() >= v_assignment.submission_close_at then
    raise exception 'ASSIGNMENT_SUBMISSIONS_EXPIRED' using errcode = '22023';
  end if;

  if (v_file_path is null) = (v_link_url is null) then
    raise exception 'เลือกส่งไฟล์หรือลิงก์เพียงอย่างเดียว';
  end if;
  if v_file_path is not null and v_file_path not like 'submissions/' || v_student_code || '/%' then
    raise exception 'ตำแหน่งไฟล์ส่งงานไม่ถูกต้อง';
  end if;
  if v_link_url is not null and v_link_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'ลิงก์งานต้องขึ้นต้นด้วย http:// หรือ https://';
  end if;

  select array_agg(member_code order by first_position)
  into v_member_codes
  from (
    select trim(member_code) as member_code, min(position) as first_position
    from unnest(coalesce(p_member_codes, array[v_student_code])) with ordinality as member(member_code, position)
    where trim(member_code) <> ''
    group by trim(member_code)
  ) normalized;

  v_member_codes := coalesce(v_member_codes, array[v_student_code]);
  if not (v_student_code = any(v_member_codes)) then
    v_member_codes := array_prepend(v_student_code, v_member_codes);
  end if;
  if cardinality(v_member_codes) > 20 then raise exception 'งานกลุ่มเลือกสมาชิกได้ไม่เกิน 20 คน'; end if;

  if (
    select count(*) from public.students s
    where s.classroom_id = v_classroom_id and s.student_code = any(v_member_codes)
  ) <> cardinality(v_member_codes) then
    raise exception 'สมาชิกทุกคนต้องอยู่ในห้องเรียนเดียวกัน';
  end if;

  select array_agg(s.full_name order by member.position)
  into v_member_names
  from unnest(v_member_codes) with ordinality as member(student_code, position)
  join public.students s
    on s.student_code = member.student_code and s.classroom_id = v_classroom_id;

  return query
  insert into public.submissions (
    assignment_id, assignment_title, student_name, student_code, classroom_id,
    file_path, link_url, submission_kind, group_member_codes, group_member_names,
    status, raw_score, raw_max, final_score, final_max
  ) values (
    v_assignment.id, v_assignment.title, v_student_name, v_student_code, v_classroom_id,
    v_file_path, v_link_url,
    case when cardinality(v_member_codes) > 1 then 'group' else 'individual' end,
    v_member_codes, v_member_names,
    'รอตรวจ', 0, v_assignment.raw_max, 0, v_assignment.final_max
  ) returning *;
end;
$$;

create or replace function public.update_score_assignment_group(
  p_assignment_group_id uuid,
  p_classroom_ids uuid[],
  p_title text,
  p_assignment_type text,
  p_raw_max numeric,
  p_final_max numeric,
  p_accepting_submissions boolean,
  p_submission_open_at timestamptz,
  p_submission_close_at timestamptz
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
  if p_submission_open_at is not null and p_submission_close_at is not null
    and p_submission_open_at >= p_submission_close_at then
    raise exception 'INVALID_SUBMISSION_WINDOW' using errcode = '22023';
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
    coalesce((select max(raw_score) from public.score_entries where assignment_id = any(selected_assignment_ids)), 0),
    coalesce((select max(raw_score) from public.submissions where assignment_id = any(selected_assignment_ids)), 0)
  ) into highest_recorded_score;

  if p_raw_max < highest_recorded_score then
    raise exception 'RAW_MAX_BELOW_RECORDED_SCORE:%', highest_recorded_score using errcode = '22023';
  end if;

  update public.score_assignments
  set
    title = trim(p_title),
    assignment_type = v_assignment_type,
    raw_max = p_raw_max,
    final_max = p_final_max,
    accepting_submissions = coalesce(p_accepting_submissions, false),
    submission_open_at = p_submission_open_at,
    submission_close_at = p_submission_close_at
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

revoke all on function public.submit_assignment_work(uuid, text, text, text[]) from public, anon;
grant execute on function public.submit_assignment_work(uuid, text, text, text[]) to authenticated;
revoke all on function public.update_score_assignment_group(uuid, uuid[], text, text, numeric, numeric, boolean, timestamptz, timestamptz) from public, anon;
grant execute on function public.update_score_assignment_group(uuid, uuid[], text, text, numeric, numeric, boolean, timestamptz, timestamptz) to authenticated;

notify pgrst, 'reload schema';

commit;
