begin;
create table if not exists public.ai_assistant_settings (
  id boolean primary key default true check (id),
  name text not null default 'ผู้ช่วย AI' check (length(trim(name)) between 1 and 60),
  student_enabled boolean not null default true,
  score_access boolean not null default true,
  tone text not null default 'friendly' check (tone in ('friendly','formal','coach')),
  answer_length text not null default 'balanced' check (answer_length in ('short','balanced','detailed')),
  instructions text not null default '' check (length(instructions)<=4000)
);
insert into public.ai_assistant_settings(id) values(true) on conflict do nothing;
alter table public.ai_assistant_settings enable row level security;
revoke all on public.ai_assistant_settings from anon, authenticated;
grant select, update on public.ai_assistant_settings to authenticated;
grant all on public.ai_assistant_settings to service_role;
drop policy if exists ai_settings_read on public.ai_assistant_settings;
create policy ai_settings_read on public.ai_assistant_settings for select to authenticated using(true);
drop policy if exists ai_settings_teacher_update on public.ai_assistant_settings;
create policy ai_settings_teacher_update on public.ai_assistant_settings for update to authenticated using(public.is_teacher()) with check(public.is_teacher());

create table if not exists public.feature_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(trim(title)) between 1 and 120),
  body text not null check(length(trim(body)) between 1 and 4000),
  audience text not null default 'student' check(audience in ('student','teacher','all')),
  enabled boolean not null default false,
  revision integer not null default 1 check(revision>0),
  updated_at timestamptz not null default now()
);
create or replace function public.bump_feature_update_revision() returns trigger
language plpgsql set search_path=public as $$
begin
  new.revision := case when tg_op='INSERT' then 1 else old.revision+1 end;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists feature_update_revision on public.feature_updates;
create trigger feature_update_revision before insert or update on public.feature_updates
for each row execute function public.bump_feature_update_revision();
alter table public.feature_updates enable row level security;
revoke all on public.feature_updates from anon, authenticated;
grant select, insert, update, delete on public.feature_updates to authenticated;
grant all on public.feature_updates to service_role;
drop policy if exists feature_updates_read on public.feature_updates;
create policy feature_updates_read on public.feature_updates for select to authenticated using (
  public.is_teacher() or (enabled and (audience='all' or audience=(select role from public.profiles where id=auth.uid())))
);
drop policy if exists feature_updates_teacher on public.feature_updates;
create policy feature_updates_teacher on public.feature_updates for all to authenticated using(public.is_teacher()) with check(public.is_teacher());

create table if not exists public.feature_update_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  update_id uuid not null references public.feature_updates(id) on delete cascade,
  revision integer not null,
  seen_at timestamptz not null default now(),
  primary key(user_id,update_id,revision)
);
alter table public.feature_update_receipts enable row level security;
revoke all on public.feature_update_receipts from anon, authenticated;
grant select, insert on public.feature_update_receipts to authenticated;
grant all on public.feature_update_receipts to service_role;
drop policy if exists feature_receipts_read on public.feature_update_receipts;
create policy feature_receipts_read on public.feature_update_receipts for select to authenticated using(user_id=auth.uid());
drop policy if exists feature_receipts_insert on public.feature_update_receipts;
create policy feature_receipts_insert on public.feature_update_receipts for insert to authenticated with check (
  user_id=auth.uid() and exists(select 1 from public.feature_updates u where u.id=update_id and u.revision=feature_update_receipts.revision and u.enabled)
);
notify pgrst, 'reload schema';
commit;
