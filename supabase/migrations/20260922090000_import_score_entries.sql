begin;

-- Import a classroom score sheet as one transaction. Every row is validated
-- before the statement can commit, so a malformed file cannot be half-saved.
create or replace function public.import_score_entries(
  p_classroom_id uuid,
  p_entries jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_assignment public.score_assignments%rowtype;
  v_student public.students%rowtype;
  v_assignment_id uuid;
  v_student_id uuid;
  v_status text;
  v_raw_score numeric;
  v_pair_key text;
  v_seen_pairs text[] := array[]::text[];
  v_count integer := 0;
begin
  if auth.uid() is null or not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;
  if p_classroom_id is null or not exists (
    select 1 from public.classrooms where id = p_classroom_id
  ) then
    raise exception 'CLASSROOM_NOT_FOUND' using errcode = '22023';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'SCORE_IMPORT_ENTRIES_REQUIRED' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 10000 then
    raise exception 'SCORE_IMPORT_TOO_LARGE' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_entries)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'INVALID_SCORE_IMPORT_ENTRY' using errcode = '22023';
    end if;
    begin
      v_assignment_id := nullif(btrim(v_item ->> 'assignment_id'), '')::uuid;
      v_student_id := nullif(btrim(v_item ->> 'student_id'), '')::uuid;
      v_status := btrim(coalesce(v_item ->> 'score_status', ''));
      v_raw_score := (v_item ->> 'raw_score')::numeric;
    exception when others then
      raise exception 'INVALID_SCORE_IMPORT_ENTRY' using errcode = '22023';
    end;
    if v_assignment_id is null or v_student_id is null
      or v_status not in ('ungraded', 'scored', 'leave', 'expired', 'no_score')
      or v_raw_score is null then
      raise exception 'INVALID_SCORE_IMPORT_ENTRY' using errcode = '22023';
    end if;

    v_pair_key := v_assignment_id::text || ':' || v_student_id::text;
    if v_pair_key = any(v_seen_pairs) then
      raise exception 'DUPLICATE_SCORE_IMPORT_ENTRY' using errcode = '22023';
    end if;
    v_seen_pairs := array_append(v_seen_pairs, v_pair_key);

    select * into v_assignment
    from public.score_assignments
    where id = v_assignment_id and classroom_id = p_classroom_id;
    if not found then
      raise exception 'SCORE_IMPORT_ASSIGNMENT_NOT_IN_CLASSROOM' using errcode = '22023';
    end if;

    select * into v_student
    from public.students
    where id = v_student_id and classroom_id = p_classroom_id;
    if not found then
      raise exception 'SCORE_IMPORT_STUDENT_NOT_IN_CLASSROOM' using errcode = '22023';
    end if;

    if v_status = 'scored' then
      if v_raw_score < 0 or v_raw_score > v_assignment.raw_max then
        raise exception 'SCORE_IMPORT_SCORE_OUT_OF_RANGE' using errcode = '22023';
      end if;
    else
      v_raw_score := 0;
    end if;

    insert into public.score_entries (
      assignment_id, student_id, student_code, score_status,
      raw_score, raw_max, final_score, final_max,
      source_type, source_id, updated_at
    ) values (
      v_assignment.id, v_student.id, v_student.student_id, v_status,
      v_raw_score, v_assignment.raw_max,
      case when v_status = 'scored'
        then greatest(0, least(v_assignment.final_max, round((v_raw_score / v_assignment.raw_max) * v_assignment.final_max)))
        else 0
      end,
      v_assignment.final_max, 'manual', null, now()
    )
    on conflict (assignment_id, student_id) do update set
      student_code = excluded.student_code,
      score_status = excluded.score_status,
      raw_score = excluded.raw_score,
      raw_max = excluded.raw_max,
      final_score = excluded.final_score,
      final_max = excluded.final_max,
      source_type = excluded.source_type,
      source_id = excluded.source_id,
      updated_at = excluded.updated_at;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.import_score_entries(uuid, jsonb) from public, anon;
grant execute on function public.import_score_entries(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
