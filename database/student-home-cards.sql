-- Run this patch once in the Supabase SQL editor.
-- It is safe to run again.

create extension if not exists "uuid-ossp";

-- Keep this focused migration usable on older production schemas too.
create or replace function public.current_student_code()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif(trim(student_code), '')
  from public.profiles
  where id = auth.uid() and role = 'student'
  limit 1;
$$;

create or replace function public.user_classroom_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.classroom_id
  from public.students s
  where s.student_code = public.current_student_code()
  limit 1;
$$;

revoke all on function public.current_student_code() from public;
revoke all on function public.user_classroom_id() from public;
grant execute on function public.current_student_code() to authenticated;
grant execute on function public.user_classroom_id() to authenticated;

create table if not exists public.student_home_cards (
  id uuid primary key default uuid_generate_v4(),
  title text not null check (char_length(trim(title)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 240),
  url text not null check (url ~* '^https?://'),
  classroom_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_home_cards_sort_idx
  on public.student_home_cards (is_active desc, sort_order, created_at);

alter table public.student_home_cards enable row level security;

drop policy if exists "student home cards select related" on public.student_home_cards;
drop policy if exists "student home cards insert teacher" on public.student_home_cards;
drop policy if exists "student home cards update teacher" on public.student_home_cards;
drop policy if exists "student home cards delete teacher" on public.student_home_cards;

create policy "student home cards select related" on public.student_home_cards
for select to authenticated
using (
  public.is_teacher()
  or (
    is_active
    and (
      cardinality(classroom_ids) = 0
      or public.user_classroom_id() = any(classroom_ids)
    )
  )
);

create policy "student home cards insert teacher" on public.student_home_cards
for insert to authenticated with check (public.is_teacher());

create policy "student home cards update teacher" on public.student_home_cards
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());

create policy "student home cards delete teacher" on public.student_home_cards
for delete to authenticated using (public.is_teacher());

notify pgrst, 'reload schema';
