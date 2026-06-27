drop policy if exists "material download logs deleteable" on public.material_download_logs;

create policy "material download logs deleteable"
on public.material_download_logs
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'teacher'
  )
);

notify pgrst, 'reload schema';
