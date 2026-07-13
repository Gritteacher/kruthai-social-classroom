-- Add classroom-scoped teacher/student chat.

begin;

create extension if not exists "uuid-ossp";

create table if not exists public.chat_messages (
  id uuid primary key default extensions.uuid_generate_v4(),
  student_code text not null,
  student_name text not null,
  classroom_id uuid references public.classrooms (id) on delete set null,
  sender_role text not null check (sender_role in ('teacher', 'student')),
  body text not null check (char_length(trim(body)) between 1 and 1200),
  is_read_by_teacher boolean not null default false,
  is_read_by_student boolean not null default false,
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_student_created_idx
  on public.chat_messages (student_code, created_at);
create index if not exists chat_messages_classroom_created_idx
  on public.chat_messages (classroom_id, created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "chat messages select own or teacher" on public.chat_messages;
drop policy if exists "chat messages insert teacher or own student" on public.chat_messages;
drop policy if exists "chat messages update teacher" on public.chat_messages;
drop policy if exists "chat messages delete teacher" on public.chat_messages;

create policy "chat messages select own or teacher" on public.chat_messages
for select to authenticated
using (public.is_teacher() or student_code = public.current_student_code());

create policy "chat messages insert teacher or own student" on public.chat_messages
for insert to authenticated with check (
  (
    public.is_teacher()
    and sender_role = 'teacher'
    and exists (
      select 1 from public.students student
      where student.student_code = chat_messages.student_code
        and (chat_messages.classroom_id is null or student.classroom_id = chat_messages.classroom_id)
    )
  )
  or (
    sender_role = 'student'
    and student_code = public.current_student_code()
    and student_name = public.current_student_name()
    and classroom_id = public.user_classroom_id()
  )
);

create policy "chat messages update teacher" on public.chat_messages
for update to authenticated
using (public.is_teacher())
with check (public.is_teacher());

create policy "chat messages delete teacher" on public.chat_messages
for delete to authenticated
using (public.is_teacher());

notify pgrst, 'reload schema';

commit;
