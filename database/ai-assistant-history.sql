-- Unlimited daily chat; preserve old usage counts, but the endpoint no longer claims them.
create table if not exists public.ai_assistant_exchanges (
  id uuid primary key,
  conversation_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null,
  author_role text not null check(author_role in ('teacher','student')),
  class_name text not null default '',
  question text not null check(char_length(question) between 1 and 6000),
  answer text not null default '',
  status text not null default 'pending' check(status in ('pending','completed','failed')),
  error_message text not null default '',
  response_data jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists ai_assistant_exchanges_thread_idx
  on public.ai_assistant_exchanges(user_id,conversation_id,created_at desc);
create index if not exists ai_assistant_exchanges_recent_idx
  on public.ai_assistant_exchanges(created_at desc);
alter table public.ai_assistant_exchanges enable row level security;
revoke all on public.ai_assistant_exchanges from anon,authenticated;
grant select on public.ai_assistant_exchanges to authenticated;
grant all on public.ai_assistant_exchanges to service_role;
drop policy if exists "assistant history own or teacher" on public.ai_assistant_exchanges;
create policy "assistant history own or teacher" on public.ai_assistant_exchanges
for select to authenticated using(user_id=auth.uid() or public.is_teacher());
notify pgrst,'reload schema';
