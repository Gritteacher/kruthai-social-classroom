-- Run this patch once in the Supabase SQL editor.
-- It is safe to run again.

begin;

alter table public.score_entries add column if not exists score_status text;

update public.score_entries
set score_status = case when raw_score > 0 then 'scored' else 'ungraded' end
where score_status is null;

alter table public.score_entries alter column score_status set default 'ungraded';
alter table public.score_entries alter column score_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'score_entries_score_status_check'
      and conrelid = 'public.score_entries'::regclass
  ) then
    alter table public.score_entries
      add constraint score_entries_score_status_check
      check (score_status in ('ungraded', 'scored', 'leave', 'expired', 'no_score'));
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
