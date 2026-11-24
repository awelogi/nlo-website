-- =====================================================================
-- 002: Pindahkan is_admin() ke skema privat yang tidak terbuka lewat API,
-- supaya tidak bisa dipanggil sebagai /rest/v1/rpc/is_admin.
-- Jalankan setelah 001_cms.sql. Aman dijalankan ulang.
-- =====================================================================
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated;

-- Policy memakai fungsi baru
drop policy if exists "admin mengubah konten" on public.site_content;
create policy "admin mengubah konten" on public.site_content
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists "admin mengubah galeri" on public.gallery;
create policy "admin mengubah galeri" on public.gallery
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists "admin melihat media" on storage.objects;
create policy "admin melihat media" on storage.objects
  for select to authenticated using (bucket_id = 'site-media' and private.is_admin());

drop policy if exists "admin mengunggah media" on storage.objects;
create policy "admin mengunggah media" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-media' and private.is_admin());

drop policy if exists "admin mengganti media" on storage.objects;
create policy "admin mengganti media" on storage.objects
  for update to authenticated using (bucket_id = 'site-media' and private.is_admin());

drop policy if exists "admin menghapus media" on storage.objects;
create policy "admin menghapus media" on storage.objects
  for delete to authenticated using (bucket_id = 'site-media' and private.is_admin());

drop function if exists public.is_admin();
