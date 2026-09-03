-- Run this focused patch in the Supabase SQL editor.
-- It adds server-generated AI grading drafts for submitted worksheet pages.

create table if not exists public.worksheet_ai_settings (
  id uuid primary key default gen_random_uuid(),
  worksheet_id uuid not null references public.worksheets (id) on delete cascade,
  page_number integer not null check (page_number > 0),
  enabled boolean not null default false,
  rubric text not null default '',
  min_confidence numeric not null default 0.70 check (min_confidence between 0 and 1),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (worksheet_id, page_number),
  constraint worksheet_ai_settings_rubric_length check (char_length(rubric) <= 4000),
  constraint worksheet_ai_settings_enabled_rubric check (not enabled or char_length(trim(rubric)) > 0)
);

create table if not exists public.worksheet_ai_reviews (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null unique references public.worksheet_page_answers (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed', 'confirmed', 'rejected')),
  suggestions jsonb not null default '[]'::jsonb,
  overall_confidence numeric not null default 0 check (overall_confidence between 0 and 1),
  feedback text not null default '',
  model text not null default '',
  error_message text not null default '',
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint worksheet_ai_reviews_suggestions_array check (jsonb_typeof(suggestions) = 'array'),
  constraint worksheet_ai_reviews_suggestions_size check (octet_length(suggestions::text) <= 65536),
  constraint worksheet_ai_reviews_feedback_length check (char_length(feedback) <= 4000),
  constraint worksheet_ai_reviews_error_length check (char_length(error_message) <= 1000)
);

create index if not exists worksheet_ai_settings_worksheet_page_idx
  on public.worksheet_ai_settings (worksheet_id, page_number);
create index if not exists worksheet_ai_reviews_status_requested_idx
  on public.worksheet_ai_reviews (status, requested_at desc);

alter table public.worksheet_ai_settings enable row level security;
alter table public.worksheet_ai_reviews enable row level security;

drop policy if exists "worksheet ai settings teacher select" on public.worksheet_ai_settings;
drop policy if exists "worksheet ai settings teacher insert" on public.worksheet_ai_settings;
drop policy if exists "worksheet ai settings teacher update" on public.worksheet_ai_settings;
drop policy if exists "worksheet ai settings teacher delete" on public.worksheet_ai_settings;
create policy "worksheet ai settings teacher select" on public.worksheet_ai_settings
for select to authenticated using (public.is_teacher());
create policy "worksheet ai settings teacher insert" on public.worksheet_ai_settings
for insert to authenticated with check (public.is_teacher());
create policy "worksheet ai settings teacher update" on public.worksheet_ai_settings
for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "worksheet ai settings teacher delete" on public.worksheet_ai_settings
for delete to authenticated using (public.is_teacher());

drop policy if exists "worksheet ai reviews select own or teacher" on public.worksheet_ai_reviews;
create policy "worksheet ai reviews select own or teacher" on public.worksheet_ai_reviews
for select to authenticated using (
  public.is_teacher()
  or exists (
    select 1
    from public.worksheet_page_answers answer
    where answer.id = worksheet_ai_reviews.answer_id
      and answer.student_code = public.current_student_code()
  )
);

create or replace function public.sync_worksheet_ai_review_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'reviewed' and old.status is distinct from new.status then
    update public.worksheet_ai_reviews
    set status = 'confirmed',
        confirmed_at = now(),
        confirmed_by = auth.uid(),
        updated_at = now()
    where answer_id = new.id
      and status = 'completed';
  elsif new.status = 'returned' and old.status is distinct from new.status then
    update public.worksheet_ai_reviews
    set status = 'rejected',
        updated_at = now()
    where answer_id = new.id
      and status in ('queued', 'processing', 'completed', 'failed');
  end if;
  return new;
end;
$$;

drop trigger if exists worksheet_answer_sync_ai_review_status on public.worksheet_page_answers;
create trigger worksheet_answer_sync_ai_review_status
after update of status on public.worksheet_page_answers
for each row execute function public.sync_worksheet_ai_review_status();

revoke all on function public.sync_worksheet_ai_review_status() from public, anon, authenticated;
grant select, insert, update, delete on public.worksheet_ai_settings to authenticated;
grant select on public.worksheet_ai_reviews to authenticated;

comment on table public.worksheet_ai_settings
is 'Teacher-only rubric and confidence settings for AI worksheet grading drafts.';
comment on table public.worksheet_ai_reviews
is 'Server-generated AI score suggestions; real scores are saved only after teacher confirmation.';

notify pgrst, 'reload schema';
