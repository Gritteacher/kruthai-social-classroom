-- Students may read only their own roster row. Classmate selection uses the
-- security-definer get_classroom_peers() RPC, which returns minimal fields.

begin;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'students'
  loop
    execute format('drop policy if exists %I on public.students', policy_record.policyname);
  end loop;
end;
$$;

create policy "students select own or teacher" on public.students
for select to authenticated
using (public.is_teacher() or student_code = public.current_student_code());

create policy "students insert teacher" on public.students
for insert to authenticated
with check (public.is_teacher());

create policy "students update teacher" on public.students
for update to authenticated
using (public.is_teacher())
with check (public.is_teacher());

create policy "students delete teacher" on public.students
for delete to authenticated
using (public.is_teacher());

commit;
