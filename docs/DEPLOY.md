# Deploy Bekuin POS ke Internet

Aplikasi **wajib HTTPS** di produksi: printer Bluetooth (Web Bluetooth), install PWA ke layar HP, dan notifikasi push hanya jalan di HTTPS.

Ada dua pilihan:

| | A. Satu VPS (disarankan) | B. Layanan terkelola |
| --- | --- | --- |
| Komponen | VPS 1–2 GB RAM + Docker | Railway (API) + Neon (DB) + Vercel (web) |
| Biaya kira-kira | Rp60–120 rb/bulan + domain | Gratis/tier awal, naik sesuai pemakaian |
| HTTPS | Otomatis (Caddy + Let's Encrypt) | Otomatis |
| Backup | Harian otomatis ke folder `backups/` | Fitur backup Neon + unduh manual |
| Foto upload | Volume Docker | Railway Volume |

---

## A. Satu VPS dengan Docker Compose

Semua jalan di satu server: PostgreSQL, API, web (Caddy), dan backup harian. Web dan API memakai **satu domain**, jadi tidak ada urusan CORS.

### 1. Siapkan server & domain

1. Sewa VPS Ubuntu 22.04/24.04 (minimal 1 vCPU, 1 GB RAM; 2 GB lebih lega). Lokasi Singapura/Jakarta.
2. Beli domain (misal `bekuin.id`) lalu buat **A record** `pos.bekuin.id` → IP VPS. Tunggu sampai `ping pos.bekuin.id` menunjuk ke IP itu.
3. Masuk ke VPS (`ssh root@IP`) dan pasang Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
4. Buka port 80 dan 443 di firewall (bila memakai `ufw`: `ufw allow 80,443/tcp && ufw allow 443/udp`).

### 2. Ambil kode & isi konfigurasi

```bash
git clone https://github.com/<akun-anda>/pos-bekuin.git
cd pos-bekuin
cp deploy/.env.example deploy/.env
nano deploy/.env
```

Isi setiap baris di `deploy/.env`:

- `DOMAIN` → `pos.bekuin.id` (tanpa `https://`)
- `ACME_EMAIL` → email Anda (untuk sertifikat HTTPS)
- `POSTGRES_PASSWORD` → hasil `openssl rand -hex 24`
- `JWT_ACCESS_SECRET` dan `JWT_REFRESH_SECRET` → masing-masing hasil `openssl rand -hex 32` (harus beda)
- `SEED_ADMIN_PASSWORD`, `SEED_STAFF_PASSWORD` → password awal (wajib diganti saat login pertama)
- Notifikasi push (opsional): jalankan `docker run --rm node:22-alpine npx -y web-push generate-vapid-keys`, lalu salin Public Key ke `VAPID_PUBLIC_KEY` dan Private Key ke `VAPID_PRIVATE_KEY`

API menolak start bila rahasia JWT masih contoh atau kosong.

### 3. Jalankan

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env up -d --build
```

Build pertama makan waktu 3–6 menit. Migrasi database jalan otomatis setiap API start. Cek status:

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env ps
curl https://pos.bekuin.id/api/v1/health      # {"status":"ok","database":"up",...}
```

### 4. Isi data awal (sekali saja)

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env exec api node dist-seed/seed.js
```

Seeder membuat akun `admin` & `staff`, kategori, menu, bahan, resep, metode bayar, 6 meja + 1 QR kasir. Seeder aman diulang: data yang sudah ada tidak ditimpa, dan di produksi tidak dibuat stok demo.

Lalu buka `https://pos.bekuin.id`, login `admin`, ganti password, dan lengkapi **Lainnya → Pengaturan** (nama toko, gambar QRIS, jam buka).

### 5. Setelah online

- **QR meja:** Lainnya → Meja & QR → Cetak semua. Isi QR otomatis memakai domain Anda.
- **HP kasir:** buka web di Chrome Android → menu ⋮ → *Tambahkan ke layar utama*. Sambungkan printer di Lainnya → Printer.
- **Notifikasi:** di tiap HP admin/staff buka Akun → aktifkan *Notifikasi di perangkat ini*.
- **Shift kasir:** buka shift di Lainnya → Keuangan setiap hari sebelum menerima cash.

### Memperbarui aplikasi

```bash
cd pos-bekuin
git pull
docker compose -f docker-compose.prod.yml --env-file deploy/.env up -d --build
```

Migrasi database baru ikut jalan otomatis. Lihat log bila ada masalah:

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/.env logs -f api
```

### Backup & restore

Container `backup` membuat backup **setiap hari jam 02.00 WITA** (atur di `BACKUP_HOUR_WITA`) ke folder `backups/` di VPS:

- `backups/db/bekuin-YYYYMMDD-HHMM.dump` untuk database
- `backups/uploads/uploads-YYYYMMDD-HHMM.tar.gz` untuk foto menu, bukti bayar, dan nota

Backup yang lebih tua dari `BACKUP_KEEP_DAYS` (default 14 hari) dihapus otomatis.

Perintah manual:

```bash
sh scripts/backup-now.sh                      # backup sekarang
sh scripts/restore-db.sh backups/db/bekuin-20260925-0200.dump \
  backups/uploads/uploads-20260925-0200.tar.gz   # pulihkan (minta konfirmasi "YA")
```

`restore-db.sh` menghentikan API, membuat backup kondisi terakhir dulu, memulihkan database (dan foto bila file kedua diisi), lalu menyalakan API lagi.

> **Simpan salinan di luar VPS.** Bila VPS rusak, backup di dalamnya ikut hilang. Minimal seminggu sekali unduh folder `backups/` ke laptop (`scp -r root@IP:pos-bekuin/backups ./`), atau pasang `rclone` untuk sinkron otomatis ke Google Drive.

**Uji restore** sebulan sekali di server/laptop cadangan. Backup yang belum pernah diuji belum bisa dipastikan bisa dipakai.

---

## B. Railway + Neon + Vercel

Cocok bila tidak ingin mengurus server. Web dan API berbeda domain, jadi CORS perlu diatur.

1. **Neon** (PostgreSQL): buat project region Singapore, salin *connection string* (pakai yang *pooled* dengan `?sslmode=require`).
2. **Railway** (API): *New Project → Deploy from GitHub repo*.
   - Settings → Build: *Dockerfile path* `apps/api/Dockerfile`, root directory `/`.
   - Tambah **Volume** di mount path `/data/uploads` untuk foto upload.
   - Variables: `NODE_ENV=production`, `DATABASE_URL` (dari Neon), `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN=https://<web>.vercel.app`, `PUBLIC_WEB_URL=https://<web>.vercel.app`, `TRUST_PROXY=1`, dan VAPID (opsional).
   - Setelah deploy, jalankan seeder sekali lewat *Railway shell*: `node dist-seed/seed.js`.
3. **Vercel** (web): *Import* repo, root directory `apps/web`, framework **Vite**.
   - Build command: `cd ../.. && pnpm --filter @bekuin/shared build && pnpm --filter @bekuin/web build`
   - Output directory: `dist`
   - Environment: `VITE_API_URL=https://<api>.up.railway.app/api/v1`, `VITE_PUBLIC_WEB_URL=https://<web>.vercel.app`
   - `apps/web/vercel.json` sudah mengatur rute SPA dan cache service worker.
4. Pasang domain sendiri di Vercel (web) dan Railway (API) bila perlu, lalu perbarui `CORS_ORIGIN`, `PUBLIC_WEB_URL`, dan `VITE_*`, kemudian deploy ulang.

Backup: aktifkan *point-in-time restore* di Neon, dan tetap unduh `pg_dump` berkala:
`pg_dump "<DATABASE_URL>" -Fc -f bekuin-$(date +%F).dump`.

---

## Checklist sebelum dipakai jualan

- [ ] `https://<domain>/api/v1/health` menampilkan `status: ok`
- [ ] Login admin & staff, password awal sudah diganti
- [ ] Pengaturan toko, gambar QRIS, jam buka, dan metode bayar sudah benar
- [ ] Menu & harga sesuai; stok awal diisi (Stok → Atur / Stok Masuk)
- [ ] Printer C58BT tersambung dari HP kasir dan struk uji tercetak
- [ ] QR meja dicetak dan dicoba: scan → pesan → muncul di Approval → approve QRIS → status di HP pelanggan berubah
- [ ] Shift kasir dibuka; approve cash & tutup shift dicoba
- [ ] Notifikasi push aktif di HP admin (kunci layar, buat order dari HP lain, notifikasi muncul)
- [ ] `sh scripts/backup-now.sh` berhasil dan file backup sudah diunduh ke laptop
