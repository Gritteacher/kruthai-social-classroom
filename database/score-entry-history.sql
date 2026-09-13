-- Append-only teacher score history. Existing scores are never rewritten.
begin;
-- Serialize installation/backfill with score writes, including direct upserts.
lock table public.score_entries in share row exclusive mode;

create table if not exists public.score_entry_history (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  assignment_id uuid not null,
  student_id uuid not null,
  classroom_id uuid,
  student_code text not null default '',
  student_name text not null default '',
  assignment_title text not null default '',
  classroom_name text not null default '',
  operation text not null check (operation in ('baseline','insert','update','delete')),
  before_score jsonb,
  after_score jsonb,
  actor_id uuid,
  actor_name text not null default '',
  actor_type text not null check (actor_type in ('teacher','user','system','baseline')),
  changed_at timestamptz not null default clock_timestamp(),
  constraint score_history_snapshots check (
    (operation in ('baseline','insert') and before_score is null and after_score is not null)
    or (operation='update' and before_score is not null and after_score is not null)
    or (operation='delete' and before_score is not null and after_score is null)
  )
);
-- No foreign keys: deleting an assignment, student or account must not erase history.
create index if not exists score_history_room_time_idx
  on public.score_entry_history(classroom_id,changed_at desc,id desc);
create index if not exists score_history_entry_time_idx
  on public.score_entry_history(entry_id,changed_at desc,id desc);
create index if not exists score_history_student_time_idx
  on public.score_entry_history(student_id,changed_at desc,id desc);
create unique index if not exists score_history_baseline_idx
  on public.score_entry_history(entry_id) where operation='baseline';

alter table public.score_entry_history enable row level security;
drop policy if exists "teachers read score history" on public.score_entry_history;
create policy "teachers read score history" on public.score_entry_history
for select to authenticated using (public.is_teacher());
revoke all on public.score_entry_history from public, anon, authenticated, service_role;
grant select on public.score_entry_history to authenticated;
grant select on public.score_entry_history to service_role;

create or replace function public.score_history_snapshot(value public.score_entries)
returns jsonb language sql immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'status',value.score_status,'raw_score',value.raw_score,'raw_max',value.raw_max,
    'final_score',value.final_score,'final_max',value.final_max
  );
$$;

create or replace function public.record_score_entry_history()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_entry public.score_entries%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_previous public.score_entry_history%rowtype;
  v_room uuid;
  v_student_name text;
  v_assignment_title text;
  v_classroom_name text;
  v_actor_name text;
  v_actor_role text;
begin
  if TG_OP <> 'INSERT' then v_before := public.score_history_snapshot(OLD); end if;
  if TG_OP <> 'DELETE' then v_after := public.score_history_snapshot(NEW); end if;
  if TG_OP='UPDATE' and v_before is not distinct from v_after
    and (OLD.assignment_id,OLD.student_id,OLD.student_code) is not distinct from
        (NEW.assignment_id,NEW.student_id,NEW.student_code) then
    return NEW;
  end if;
  if TG_OP='DELETE' then v_entry := OLD; else v_entry := NEW; end if;
  select * into v_previous from public.score_entry_history
    where entry_id=v_entry.id order by changed_at desc,id desc limit 1;
  select full_name into v_student_name from public.students where id=v_entry.student_id;
  select title,classroom_id into v_assignment_title,v_room
    from public.score_assignments where id=v_entry.assignment_id;
  v_room := coalesce(v_room,v_previous.classroom_id);
  select display_name into v_classroom_name from public.classrooms where id=v_room;
  select full_name,role into v_actor_name,v_actor_role from public.profiles where id=auth.uid();

  insert into public.score_entry_history (
    entry_id,assignment_id,student_id,classroom_id,student_code,student_name,
    assignment_title,classroom_name,operation,before_score,after_score,
    actor_id,actor_name,actor_type
  ) values (
    v_entry.id,v_entry.assignment_id,v_entry.student_id,v_room,coalesce(v_entry.student_code,''),
    coalesce(v_student_name,v_previous.student_name,''),
    coalesce(v_assignment_title,v_previous.assignment_title,''),
    coalesce(v_classroom_name,v_previous.classroom_name,''),
    lower(TG_OP),v_before,v_after,auth.uid(),coalesce(v_actor_name,''),
    case when auth.uid() is null then 'system' when v_actor_role='teacher' then 'teacher' else 'user' end
  );
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end;
$$;

revoke all on function public.score_history_snapshot(public.score_entries) from public,anon,authenticated,service_role;
revoke all on function public.record_score_entry_history() from public,anon,authenticated,service_role;

-- One baseline per existing entry, not fabricated past editing activity.
insert into public.score_entry_history (
  entry_id,assignment_id,student_id,classroom_id,student_code,student_name,
  assignment_title,classroom_name,operation,after_score,actor_name,actor_type
)
select e.id,e.assignment_id,e.student_id,a.classroom_id,coalesce(e.student_code,''),
  coalesce(s.full_name,''),coalesce(a.title,''),coalesce(c.display_name,''),
  'baseline',public.score_history_snapshot(e),'','baseline'
from public.score_entries e
left join public.students s on s.id=e.student_id
left join public.score_assignments a on a.id=e.assignment_id
left join public.classrooms c on c.id=a.classroom_id
where not exists (select 1 from public.score_entry_history h where h.entry_id=e.id)
on conflict (entry_id) where operation='baseline' do nothing;

drop trigger if exists score_entries_record_history on public.score_entries;
create trigger score_entries_record_history
after insert or update or delete on public.score_entries
for each row execute function public.record_score_entry_history();

comment on table public.score_entry_history is
'Append-only score change audit. Baselines reflect installation time, not historical edit time. Teacher read access only. No cascading deletion.';
notify pgrst,'reload schema';
commit;
