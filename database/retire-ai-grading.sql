-- Retire automatic grading without deleting scores, submissions, files, or audit history.
begin;

-- Remove every legacy overload so older deployments cannot apply AI scores.
do $retire$
declare
  routine regprocedure;
  archive_name text;
begin
  for routine in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'apply_submission_ai_grade'
  loop
    execute format('drop function %s', routine);
  end loop;

  if to_regclass('public.worksheet_page_answers') is not null then
    execute 'drop trigger if exists worksheet_answer_sync_ai_review_status on public.worksheet_page_answers';
  end if;

  -- Old review/settings tables are retained as read-only audit history.
  -- Workers from older deployment URLs must not be able to write to them.
  foreach archive_name in array array['submission_ai_reviews', 'worksheet_ai_reviews', 'worksheet_ai_settings']
  loop
    if to_regclass('public.' || archive_name) is not null then
      execute format('revoke insert, update, delete, truncate on table public.%I from public, anon, authenticated, service_role', archive_name);
    end if;
  end loop;
end;
$retire$;

drop function if exists public.sync_worksheet_ai_review_status();
notify pgrst, 'reload schema';
commit;
