-- Atomically review several submissions and sync every affected score entry.

begin;

create or replace function public.review_submissions_and_sync_scores(
  p_reviews jsonb
)
returns setof public.submissions
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_review jsonb;
  v_submission_id uuid;
  v_raw_score numeric;
  v_raw_max numeric;
  v_final_max numeric;
  v_seen_ids uuid[] := array[]::uuid[];
  v_saved public.submissions%rowtype;
begin
  if not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  if p_reviews is null
    or jsonb_typeof(p_reviews) <> 'array'
    or jsonb_array_length(p_reviews) = 0 then
    raise exception 'REVIEWS_REQUIRED' using errcode = '22023';
  end if;

  if jsonb_array_length(p_reviews) > 100 then
    raise exception 'TOO_MANY_REVIEWS' using errcode = '22023';
  end if;

  for v_review in select value from jsonb_array_elements(p_reviews)
  loop
    if jsonb_typeof(v_review) <> 'object' then
      raise exception 'INVALID_REVIEW' using errcode = '22023';
    end if;

    begin
      v_submission_id := nullif(btrim(v_review ->> 'submission_id'), '')::uuid;
      v_raw_score := (v_review ->> 'raw_score')::numeric;
      v_raw_max := (v_review ->> 'raw_max')::numeric;
      v_final_max := (v_review ->> 'final_max')::numeric;
    exception when others then
      raise exception 'INVALID_REVIEW' using errcode = '22023';
    end;

    if v_submission_id is null
      or v_raw_score is null
      or v_raw_score < 0
      or v_raw_max is null
      or v_raw_max <= 0
      or v_raw_score > v_raw_max
      or v_final_max is null
      or v_final_max <= 0 then
      raise exception 'INVALID_REVIEW_SCORE' using errcode = '22023';
    end if;

    if v_submission_id = any(v_seen_ids) then
      raise exception 'DUPLICATE_SUBMISSION' using errcode = '22023';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_submission_id);

    select * into v_saved
    from public.review_submission_and_sync_scores(
      v_submission_id,
      'ตรวจแล้ว',
      v_raw_score,
      v_raw_max,
      v_final_max
    );

    return next v_saved;
  end loop;
end;
$$;

revoke all on function public.review_submissions_and_sync_scores(jsonb) from public, anon;
grant execute on function public.review_submissions_and_sync_scores(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
