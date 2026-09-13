-- Bring teacher-managed feature settings and AI history under migrations.

begin;

create table if not exists public.ai_assistant_settings (
  id boolean primary key default true check (id),
  name text not null default 'ผู้ช่วย AI' check (length(trim(name)) between 1 and 60),
  student_enabled boolean not null default true,
  score_access boolean not null default true,
  tone text not null default 'friendly' check (tone in ('friendly','formal','coach')),
  answer_length text not null default 'balanced' check (answer_length in ('short','balanced','detailed')),
  instructions text not null default '' check (length(instructions) <= 4000),
  daily_student_limit integer not null default 0 check (daily_student_limit between 0 and 1000),
  daily_teacher_limit integer not null default 0 check (daily_teacher_limit between 0 and 2000),
  history_retention_days integer not null default 90 check (history_retention_days between 7 and 3650)
);
alter table public.ai_assistant_settings add column if not exists daily_student_limit integer not null default 0;
alter table public.ai_assistant_settings add column if not exists daily_teacher_limit integer not null default 0;
alter table public.ai_assistant_settings add column if not exists history_retention_days integer not null default 90;
insert into public.ai_assistant_settings (id) values (true) on conflict do nothing;
alter table public.ai_assistant_settings enable row level security;
revoke all on public.ai_assistant_settings from anon, authenticated;
grant select, update on public.ai_assistant_settings to authenticated;
grant all on public.ai_assistant_settings to service_role;
drop policy if exists ai_settings_read on public.ai_assistant_settings;
create policy ai_settings_read on public.ai_assistant_settings for select to authenticated using (true);
drop policy if exists ai_settings_teacher_update on public.ai_assistant_settings;
create policy ai_settings_teacher_update on public.ai_assistant_settings for update to authenticated using (public.is_teacher()) with check (public.is_teacher());

create table if not exists public.feature_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null check (length(trim(body)) between 1 and 4000),
  audience text not null default 'student' check (audience in ('student','teacher','all')),
  enabled boolean not null default false,
  display_frequency text not null default 'once' check (display_frequency in ('once','every_visit')),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.feature_updates add column if not exists display_frequency text not null default 'once';
create or replace function public.bump_feature_update_revision()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.revision := case when tg_op = 'INSERT' then 1 else old.revision + 1 end;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists feature_update_revision on public.feature_updates;
create trigger feature_update_revision before insert or update on public.feature_updates
for each row execute function public.bump_feature_update_revision();
alter table public.feature_updates enable row level security;
revoke all on public.feature_updates from anon, authenticated;
grant select, insert, update, delete on public.feature_updates to authenticated;
grant all on public.feature_updates to service_role;
drop policy if exists feature_updates_read on public.feature_updates;
create policy feature_updates_read on public.feature_updates for select to authenticated using (
  public.is_teacher() or (enabled and (audience = 'all' or audience = (select role from public.profiles where id = auth.uid())))
);
drop policy if exists feature_updates_teacher on public.feature_updates;
create policy feature_updates_teacher on public.feature_updates for all to authenticated using (public.is_teacher()) with check (public.is_teacher());

create table if not exists public.feature_update_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  update_id uuid not null references public.feature_updates(id) on delete cascade,
  revision integer not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, update_id, revision)
);
alter table public.feature_update_receipts enable row level security;
revoke all on public.feature_update_receipts from anon, authenticated;
grant select, insert on public.feature_update_receipts to authenticated;
grant all on public.feature_update_receipts to service_role;
drop policy if exists feature_receipts_read on public.feature_update_receipts;
create policy feature_receipts_read on public.feature_update_receipts for select to authenticated using (user_id = auth.uid());
drop policy if exists feature_receipts_insert on public.feature_update_receipts;
create policy feature_receipts_insert on public.feature_update_receipts for insert to authenticated with check (
  user_id = auth.uid() and exists (
    select 1 from public.feature_updates update_item
    where update_item.id = update_id and update_item.revision = feature_update_receipts.revision and update_item.enabled
  )
);

create table if not exists public.ai_assistant_exchanges (
  id uuid primary key,
  conversation_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  author_role text not null check (author_role in ('teacher','student')),
  class_name text not null default '',
  question text not null check (char_length(question) between 1 and 6000),
  answer text not null default '',
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  error_message text not null default '',
  response_data jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists ai_assistant_exchanges_thread_idx
  on public.ai_assistant_exchanges (user_id, conversation_id, created_at desc);
create index if not exists ai_assistant_exchanges_recent_idx
  on public.ai_assistant_exchanges (created_at desc, id);
alter table public.ai_assistant_exchanges enable row level security;
revoke all on public.ai_assistant_exchanges from anon, authenticated;
grant select on public.ai_assistant_exchanges to authenticated;
grant all on public.ai_assistant_exchanges to service_role;
drop policy if exists "assistant history own or teacher" on public.ai_assistant_exchanges;
create policy "assistant history own or teacher" on public.ai_assistant_exchanges
for select to authenticated using (user_id = auth.uid() or public.is_teacher());

create table if not exists public.ai_assistant_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_date)
);
alter table public.ai_assistant_usage enable row level security;
revoke all on public.ai_assistant_usage from public, anon, authenticated;
grant all on public.ai_assistant_usage to service_role;

create or replace function public.claim_ai_assistant_request(p_user_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_limit integer;
  v_count integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  select case when profile.role = 'teacher' then settings.daily_teacher_limit else settings.daily_student_limit end
  into v_limit
  from public.profiles profile cross join public.ai_assistant_settings settings
  where profile.id = p_user_id and profile.role in ('teacher', 'student') and settings.id = true;
  if v_limit is null then raise exception 'PROFILE_REQUIRED'; end if;

  insert into public.ai_assistant_usage (user_id, usage_date, request_count)
  values (p_user_id, (now() at time zone 'Asia/Bangkok')::date, 1)
  on conflict (user_id, usage_date) do update
  set request_count = public.ai_assistant_usage.request_count + 1
  where v_limit = 0 or public.ai_assistant_usage.request_count < v_limit
  returning request_count into v_count;
  if v_count is null then raise exception 'AI_DAILY_LIMIT'; end if;
  return case when v_limit = 0 then -1 else v_limit - v_count end;
end;
$$;
revoke all on function public.claim_ai_assistant_request(uuid) from public, anon, authenticated;
grant execute on function public.claim_ai_assistant_request(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
