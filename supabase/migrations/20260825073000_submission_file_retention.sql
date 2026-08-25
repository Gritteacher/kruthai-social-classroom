-- Retain reviewed submission data while removing uploaded files after seven days.

begin;

alter table public.submissions add column if not exists reviewed_at timestamptz;
alter table public.submissions add column if not exists file_deleted_at timestamptz;
alter table public.submissions add column if not exists original_file_name text;

update public.submissions
set original_file_name = regexp_replace(file_path, '^.*/[0-9]+-', '')
where file_path is not null
  and nullif(trim(original_file_name), '') is null;

-- Existing reviewed work receives a fresh seven-day grace period at migration time.
update public.submissions
set reviewed_at = now()
where status = 'ตรวจแล้ว'
  and reviewed_at is null;

create index if not exists submissions_reviewed_file_cleanup_idx
  on public.submissions (reviewed_at)
  where status = 'ตรวจแล้ว'
    and file_path is not null
    and file_deleted_at is null;

alter table public.submissions drop constraint if exists submissions_delivery_check;
alter table public.submissions
  add constraint submissions_delivery_check
  check (
    (file_path is not null and link_url is null)
    or (file_path is null and link_url is not null)
    or (file_path is null and link_url is null and file_deleted_at is not null)
  ) not valid;

create or replace function public.stamp_submission_file_retention()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.file_path is not null
    and (tg_op = 'INSERT' or old.file_path is distinct from new.file_path)
  then
    new.original_file_name := regexp_replace(new.file_path, '^.*/[0-9]+-', '');
    new.file_deleted_at := null;
  end if;

  if new.status = 'ตรวจแล้ว' then
    if tg_op = 'INSERT' then
      new.reviewed_at := coalesce(new.reviewed_at, now());
    elsif new.reviewed_at is null
      or old.status is distinct from new.status
      or old.raw_score is distinct from new.raw_score
      or old.raw_max is distinct from new.raw_max
      or old.final_score is distinct from new.final_score
      or old.final_max is distinct from new.final_max
    then
      new.reviewed_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists stamp_submission_file_retention on public.submissions;
create trigger stamp_submission_file_retention
before insert or update on public.submissions
for each row execute function public.stamp_submission_file_retention();

notify pgrst, 'reload schema';

commit;
