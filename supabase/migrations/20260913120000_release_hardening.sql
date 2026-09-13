-- Transactional destructive actions, deferred storage cleanup and query indexes.
-- Safe to run repeatedly after the base schema and role helpers are installed.

begin;

create table if not exists public.storage_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null default 'classroom-files',
  object_path text not null,
  reason text not null default 'record_deleted',
  status text not null default 'pending' check (status in ('pending', 'completed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (bucket_id, object_path)
);

create index if not exists storage_cleanup_queue_pending_idx
  on public.storage_cleanup_queue (created_at, id)
  where status = 'pending';
create index if not exists students_classroom_order_idx
  on public.students (classroom_id, student_no, id);
create index if not exists score_assignments_classroom_order_idx
  on public.score_assignments (classroom_id, created_at, id);
create index if not exists score_entries_student_assignment_idx
  on public.score_entries (student_id, assignment_id);
create index if not exists submissions_classroom_review_idx
  on public.submissions (classroom_id, status, submitted_at desc, id);
create index if not exists submissions_student_time_idx
  on public.submissions (student_code, submitted_at desc, id);
create index if not exists materials_level_time_idx
  on public.materials (level, published_at desc, id);
create index if not exists announcements_classroom_time_idx
  on public.announcements (classroom_id, published_at desc, id);
create index if not exists material_download_logs_student_time_idx
  on public.material_download_logs (student_code, downloaded_at desc, id);
create index if not exists material_download_logs_classroom_time_idx
  on public.material_download_logs (classroom_id, downloaded_at desc, id);

alter table public.storage_cleanup_queue enable row level security;
revoke all on public.storage_cleanup_queue from public, anon, authenticated;
grant select, insert, update, delete on public.storage_cleanup_queue to service_role;

create or replace function public.enqueue_storage_cleanup(
  p_paths text[],
  p_reason text default 'record_deleted'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  insert into public.storage_cleanup_queue (bucket_id, object_path, reason, status, attempts, last_error, completed_at)
  select 'classroom-files', trim(path), left(coalesce(nullif(trim(p_reason), ''), 'record_deleted'), 120), 'pending', 0, null, null
  from unnest(coalesce(p_paths, array[]::text[])) path
  where nullif(trim(path), '') is not null
  on conflict (bucket_id, object_path) do update
  set reason = excluded.reason,
      status = 'pending',
      attempts = 0,
      last_error = null,
      completed_at = null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.enqueue_storage_cleanup(text[], text) from public, anon, authenticated, service_role;

create or replace function public.delete_material_with_cleanup(p_material_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_paths text[];
begin
  if not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  select array_remove(array[file_path, cover_path], null)
  into v_paths
  from public.materials
  where id = p_material_id
  for update;

  if not found then return false; end if;
  perform public.enqueue_storage_cleanup(v_paths, 'material_deleted');
  delete from public.materials where id = p_material_id;
  return true;
end;
$$;

create or replace function public.delete_submission_with_cleanup(p_submission_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_path text;
begin
  if not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  select file_path into v_path
  from public.submissions
  where id = p_submission_id
  for update;

  if not found then return false; end if;
  perform public.enqueue_storage_cleanup(array[v_path], 'submission_deleted');
  delete from public.submissions where id = p_submission_id;
  return true;
end;
$$;

create or replace function public.delete_worksheet_with_cleanup(p_worksheet_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_path text;
begin
  if not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  select file_path into v_path
  from public.worksheets
  where id = p_worksheet_id
  for update;

  if not found then return false; end if;
  perform public.enqueue_storage_cleanup(array[v_path], 'worksheet_deleted');
  delete from public.worksheets where id = p_worksheet_id;
  return true;
end;
$$;

create or replace function public.delete_classroom_with_cleanup(p_classroom_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
  v_paths text[];
  v_file_count integer := 0;
begin
  if not public.is_teacher() then
    raise exception 'TEACHER_REQUIRED' using errcode = '42501';
  end if;

  select display_name into v_name
  from public.classrooms
  where id = p_classroom_id
  for update;
  if not found then
    raise exception 'CLASSROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(path), array[]::text[])
  into v_paths
  from (
    select file_path as path from public.materials where classroom_id = p_classroom_id
    union all
    select cover_path from public.materials where classroom_id = p_classroom_id
    union all
    select file_path from public.submissions where classroom_id = p_classroom_id
    union all
    select file_path from public.student_roster_uploads where classroom_id = p_classroom_id
  ) files
  where nullif(trim(path), '') is not null;

  v_file_count := public.enqueue_storage_cleanup(v_paths, 'classroom_deleted');

  delete from public.announcements where classroom_id = p_classroom_id;
  delete from public.material_download_logs where classroom_id = p_classroom_id;
  delete from public.materials where classroom_id = p_classroom_id;
  delete from public.submissions where classroom_id = p_classroom_id;
  delete from public.score_assignments where classroom_id = p_classroom_id;
  delete from public.students where classroom_id = p_classroom_id;
  delete from public.student_roster_uploads where classroom_id = p_classroom_id;
  delete from public.chat_messages where classroom_id = p_classroom_id;
  update public.student_home_cards
  set classroom_ids = array_remove(classroom_ids, p_classroom_id), updated_at = now()
  where p_classroom_id = any(classroom_ids);
  delete from public.classrooms where id = p_classroom_id;

  return jsonb_build_object(
    'ok', true,
    'classroom_id', p_classroom_id,
    'classroom_name', v_name,
    'queued_files', v_file_count
  );
end;
$$;

revoke all on function public.delete_material_with_cleanup(uuid) from public, anon;
revoke all on function public.delete_submission_with_cleanup(uuid) from public, anon;
revoke all on function public.delete_worksheet_with_cleanup(uuid) from public, anon;
revoke all on function public.delete_classroom_with_cleanup(uuid) from public, anon;
grant execute on function public.delete_material_with_cleanup(uuid) to authenticated;
grant execute on function public.delete_submission_with_cleanup(uuid) to authenticated;
grant execute on function public.delete_worksheet_with_cleanup(uuid) to authenticated;
grant execute on function public.delete_classroom_with_cleanup(uuid) to authenticated;

comment on table public.storage_cleanup_queue is
  'Server-processed retry queue for storage objects whose owning database records were deleted.';
comment on function public.delete_classroom_with_cleanup(uuid) is
  'Teacher-only transactional classroom deletion. Storage objects are queued for idempotent server cleanup.';

notify pgrst, 'reload schema';
commit;
