-- =====================================================================
-- NLO Website CMS — migrasi awal
-- Jalankan sekali di Supabase: Dashboard > SQL Editor > New query > Run.
-- Aman dijalankan ulang (memakai IF NOT EXISTS / OR REPLACE).
-- =====================================================================

-- 1. Daftar admin -------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

drop policy if exists "admin melihat dirinya" on public.admins;
create policy "admin melihat dirinya" on public.admins
  for select to authenticated using (user_id = auth.uid());

-- Fungsi pengecek admin (security definer agar bisa dipakai di policy lain)
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 2. Konten teks & foto pengganti --------------------------------------
create table if not exists public.site_content (
  key        text primary key,
  kind       text not null default 'text' check (kind in ('text', 'image')),
  value      text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.site_content enable row level security;

drop policy if exists "publik membaca konten" on public.site_content;
create policy "publik membaca konten" on public.site_content
  for select to anon, authenticated using (true);

drop policy if exists "admin mengubah konten" on public.site_content;
create policy "admin mengubah konten" on public.site_content
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 3. Galeri foto ---------------------------------------------------------
create table if not exists public.gallery (
  id           uuid primary key default gen_random_uuid(),
  page         text not null check (page in ('home', 'gathering')),
  image_url    text not null,
  storage_path text not null,
  caption      text not null default '',
  sort         integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists gallery_page_sort on public.gallery (page, sort);
alter table public.gallery enable row level security;

drop policy if exists "publik membaca galeri" on public.gallery;
create policy "publik membaca galeri" on public.gallery
  for select to anon, authenticated using (true);

drop policy if exists "admin mengubah galeri" on public.gallery;
create policy "admin mengubah galeri" on public.gallery
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Hak akses tabel (RLS di atas tetap menjadi penentu baris)
grant select on public.site_content, public.gallery to anon, authenticated;
grant insert, update, delete on public.site_content, public.gallery to authenticated;
grant select on public.admins to authenticated;

-- updated_at otomatis
create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists site_content_touch on public.site_content;
create trigger site_content_touch before update on public.site_content
  for each row execute function public.touch_updated_at();

-- 4. Penyimpanan foto (bucket publik, hanya admin yang boleh menulis) ---
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Bucket publik: file tetap bisa dibuka lewat URL publik tanpa policy SELECT.
-- SELECT hanya untuk admin (dibutuhkan saat mengganti/menghapus), agar daftar file tidak bisa dilihat publik.
drop policy if exists "publik melihat media" on storage.objects;
drop policy if exists "admin melihat media" on storage.objects;
create policy "admin melihat media" on storage.objects
  for select to authenticated using (bucket_id = 'site-media' and public.is_admin());

drop policy if exists "admin mengunggah media" on storage.objects;
create policy "admin mengunggah media" on storage.objects
  for insert to authenticated with check (bucket_id = 'site-media' and public.is_admin());

drop policy if exists "admin mengganti media" on storage.objects;
create policy "admin mengganti media" on storage.objects
  for update to authenticated using (bucket_id = 'site-media' and public.is_admin());

drop policy if exists "admin menghapus media" on storage.objects;
create policy "admin menghapus media" on storage.objects
  for delete to authenticated using (bucket_id = 'site-media' and public.is_admin());

-- =====================================================================
-- 5. Menjadikan akun sebagai admin (jalankan SETELAH membuat user di
--    Authentication > Users > Add user). Ganti emailnya:
--
--   insert into public.admins (user_id, email)
--   select id, email from auth.users where email = 'admin@contoh.com'
--   on conflict (user_id) do nothing;
-- =====================================================================
