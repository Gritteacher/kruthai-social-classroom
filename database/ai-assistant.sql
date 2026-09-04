-- Daily budget is server controlled; this table stores counts, not conversations.
create table if not exists public.ai_assistant_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check(request_count >= 0),
  primary key(user_id, usage_date)
);
alter table public.ai_assistant_usage enable row level security;
revoke all on public.ai_assistant_usage from anon, authenticated;
create or replace function public.claim_ai_assistant_request(p_user_id uuid)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_limit integer; v_count integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  select case when role='teacher' then 100 else 30 end into v_limit
  from public.profiles where id=p_user_id and role in ('teacher','student');
  if v_limit is null then raise exception 'PROFILE_REQUIRED'; end if;
  insert into public.ai_assistant_usage(user_id,usage_date,request_count)
  values(p_user_id,(now() at time zone 'Asia/Bangkok')::date,1)
  on conflict(user_id,usage_date) do update
  set request_count=ai_assistant_usage.request_count+1
  where ai_assistant_usage.request_count<v_limit
  returning request_count into v_count;
  if v_count is null then raise exception 'AI_DAILY_LIMIT'; end if;
  return v_limit-v_count;
end; $$;
revoke all on function public.claim_ai_assistant_request(uuid) from public,anon,authenticated;
grant execute on function public.claim_ai_assistant_request(uuid) to service_role;
notify pgrst,'reload schema';
