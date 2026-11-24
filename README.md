# Website Need Learning Organizer (NLO)

Situs statis (HTML, CSS, JS tanpa proses build) dengan halaman admin berbasis Supabase.

```
index.html              Beranda
gathering/index.html    Halaman The Art of Gathering
admin/                  Halaman admin (login, teks, foto, galeri, akun)
  slots.json            Daftar teks dan foto yang bisa diedit beserta nilai bawaannya
assets/config.js        Alamat dan kunci publik Supabase (WAJIB diisi)
assets/cms.js           Pemuat konten dari Supabase untuk halaman publik
img/                    Foto dan logo bawaan
supabase/migrations/    SQL untuk membuat tabel, izin, dan penyimpanan foto
```

Selama `assets/config.js` masih kosong, situs tetap tampil normal dengan konten bawaan. Halaman admin hanya menampilkan petunjuk pengaturan.

## Apa saja yang bisa diatur admin

- **Teks**: judul dan paragraf pembuka setiap bagian, visi, serta kontak (telepon/WhatsApp, email, Instagram, nama PIC). Mengubah nomor telepon otomatis memperbarui semua tombol WhatsApp dan tautan telepon.
- **Foto halaman**: foto utama beranda dan 10 foto di halaman Gathering bisa diganti. Foto otomatis diperkecil (maks. 1800 px) dan dikompres ke WebP sebelum diunggah.
- **Galeri**: unggah banyak foto sekaligus, beri keterangan, atur urutan, hapus. Bagian Galeri di halaman hanya muncul jika sudah ada foto.
- **Akun**: ganti kata sandi, dan reset lewat email jika lupa.

Belum bisa diedit dari admin (masih di HTML): isi tab lima tahap karier, Signature program, daftar FAQ, dan ilustrasi.

---

## Langkah deploy

### 1. Buat proyek Supabase
1. Masuk ke https://supabase.com, lalu **New project**. Pilih region **Southeast Asia (Singapore)**.
2. Simpan kata sandi database di tempat aman.

> Proyek NLO yang sudah berjalan: `nlo-website` (ref `tlhtbaiqifdkokqwxepa`) di org **NLO Project**, region Singapore. Migrasi 001 dan 002 sudah dijalankan, dan `assets/config.js` sudah terisi. Langkah 1, 2, dan 5 hanya perlu diulang kalau membuat proyek baru.

### 2. Jalankan migrasi database
1. Buka **SQL Editor > New query**.
2. Salin seluruh isi `supabase/migrations/001_cms.sql`, tempel, lalu klik **Run**.
3. Ulangi untuk `supabase/migrations/002_private_is_admin.sql`.
3. Periksa hasilnya: di **Table Editor** muncul tabel `admins`, `site_content`, `gallery`; di **Storage** muncul bucket `site-media` (Public).

### 3. Atur autentikasi
1. **Authentication > Sign In / Providers**: matikan **Allow new users to sign up**, supaya orang lain tidak bisa mendaftar sendiri.
2. **Authentication > URL Configuration**:
   - **Site URL**: alamat situs, misalnya `https://awelogi.github.io/nlo-website/`
   - **Redirect URLs**: tambahkan `https://awelogi.github.io/nlo-website/admin/` (dipakai tautan reset kata sandi)

### 4. Buat akun admin
1. **Authentication > Users > Add user > Create new user**: isi email dan kata sandi, centang **Auto Confirm User**.
2. Di **SQL Editor**, jalankan (ganti emailnya):
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'admin@contoh.com'
   on conflict (user_id) do nothing;
   ```
   Ulangi untuk setiap admin tambahan.

### 5. Isi konfigurasi situs
1. **Project Settings > API** (atau **Data API / API Keys**): salin **Project URL** dan kunci **anon** atau **publishable**.
2. Isi `assets/config.js`:
   ```js
   window.NLO_CONFIG = {
     supabaseUrl: "https://xxxxxxxx.supabase.co",
     supabaseAnonKey: "kunci-anon-atau-publishable"
   };
   ```
   Jangan pernah memakai kunci **service_role / secret** di file ini.

### 6. Unggah ke GitHub Pages
```bash
cd nlo-website
git init
git add .
git commit -m "Website NLO dengan admin Supabase"
git branch -M main
git remote add origin https://github.com/awelogi/nlo-website.git
git push -u origin main
```
Lalu di GitHub: **Settings > Pages > Build and deployment > Source: Deploy from a branch**, pilih `main` dan folder `/ (root)`, klik **Save**. Situs aktif dalam 1 sampai 2 menit di `https://awelogi.github.io/nlo-website/`.

Tidak ada proses build. File yang perlu ditimpa saat pembaruan hanyalah file yang Anda ubah.

### 7. Uji setelah deploy
1. Buka beranda dan halaman Gathering: tampil normal, tidak ada error di Console browser.
2. Buka `/admin/`, masuk dengan akun admin.
3. Ubah satu judul, klik **Simpan perubahan**, lalu muat ulang beranda: judul baru muncul.
4. Ganti satu foto di **Foto halaman**, lalu cek halaman Gathering.
5. Unggah satu foto ke **Galeri**: bagian Galeri muncul di halaman Gathering.
6. Ubah nomor telepon di **Teks > Kontak**: tombol WhatsApp di situs ikut berganti.
7. Coba masuk dengan akun yang bukan admin: harus ditolak.

### (Opsional) Domain sendiri
Di **Settings > Pages > Custom domain**, isi misalnya `needlearningorganizer.com`, lalu di penyedia domain buat record `CNAME` `www` ke `awelogi.github.io` (atau 4 record `A` sesuai panduan GitHub untuk domain utama). Setelah itu perbarui **Site URL** dan **Redirect URLs** di Supabase ke domain baru.

---

## Catatan teknis
- Halaman publik membaca data lewat REST API Supabase dengan kunci publik. Izin baca dan tulis diatur oleh Row Level Security di migrasi: semua orang hanya bisa membaca, dan hanya akun di tabel `admins` yang bisa mengubah.
- Konten bawaan tetap ada di HTML, sehingga situs tetap tampil walau Supabase sedang tidak bisa dihubungi.
- Menambah teks baru yang bisa diedit: beri atribut `data-cms="kunci.unik"` pada elemennya, lalu tambahkan entri yang sama di `admin/slots.json`.
- Supabase gratis membekukan proyek setelah sekitar seminggu tanpa aktivitas. Situs tetap tampil dengan konten bawaan, tetapi perubahan dari admin tidak terbaca sampai proyek diaktifkan lagi dari dashboard.
