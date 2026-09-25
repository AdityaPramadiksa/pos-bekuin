# Panduan Setup Bekuin POS dari Nol

Panduan ini untuk menyiapkan laptop (Windows, macOS, atau Linux) sampai aplikasi jalan di browser, dan bisa dibuka dari HP di WiFi yang sama.

## 1. Software yang Wajib Di-install

| Software | Versi | Untuk apa | Cek terpasang |
| --- | --- | --- | --- |
| **Git** | terbaru | Menyimpan & mengirim kode ke GitHub | `git --version` |
| **Node.js** | **22 LTS** (minimal 20.19) | Menjalankan API, web, dan tooling | `node -v` |
| **pnpm** | 10.x | Package manager monorepo | `pnpm -v` |
| **Docker Desktop** | terbaru | Menjalankan PostgreSQL tanpa install manual | `docker --version` |
| **VS Code** | terbaru | Editor kode | — |
| **Google Chrome** | terbaru (juga di HP Android) | Testing, dan satu-satunya browser yang mendukung print Bluetooth | — |

### Windows (PowerShell sebagai Administrator)

```powershell
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Docker.DockerDesktop -e
winget install --id Microsoft.VisualStudioCode -e
# tutup & buka lagi terminal, lalu aktifkan pnpm:
corepack enable
```

Docker Desktop di Windows butuh **WSL 2**. Bila diminta, jalankan `wsl --install`, restart laptop, lalu buka Docker Desktop sampai statusnya "Engine running".

### macOS (Homebrew)

```bash
brew install git node@22
brew install --cask docker visual-studio-code google-chrome
corepack enable
```

### Linux (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y git curl
# Node 22 lewat nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc && nvm install 22
corepack enable
# Docker Engine: ikuti https://docs.docker.com/engine/install/ubuntu/
```

Bila `corepack enable` gagal, pakai `npm install -g pnpm@10` sebagai gantinya.

**Tanpa Docker?** Install PostgreSQL 16 langsung dari https://www.postgresql.org/download/, lalu buat user `bekuin` (password `bekuin`) dan database `bekuin_pos`. Sesuaikan `DATABASE_URL` di `apps/api/.env`.

### Ekstensi VS Code

Saat folder proyek dibuka, VS Code akan menawarkan ekstensi rekomendasi (`.vscode/extensions.json`). Klik **Install All**:

- ESLint, Prettier, Prisma, Tailwind CSS IntelliSense, Docker

### Opsional tapi Berguna

| Software | Untuk apa |
| --- | --- |
| **Bruno** atau **Postman** | Mencoba endpoint API (atau pakai Swagger di `/api/docs`) |
| **DBeaver** / **TablePlus** | Melihat isi database (atau pakai `pnpm db:studio`) |
| **cloudflared** (Cloudflare Tunnel) | Memberi alamat HTTPS sementara agar print Bluetooth & install PWA bisa dites dari HP |
| **GitHub Desktop** | Bila belum terbiasa git lewat terminal |

## 2. Menjalankan Proyek Pertama Kali

```bash
# 1. Ambil kode
git clone https://github.com/AdityaPramadiksa/pos-bekuin.git
cd pos-bekuin

# 2. Install semua dependency (API, web, shared sekaligus)
pnpm install

# 3. Salin file konfigurasi
cp apps/api/.env.example apps/api/.env      # Windows PowerShell: copy apps\api\.env.example apps\api\.env
cp apps/web/.env.example apps/web/.env      # Windows PowerShell: copy apps\web\.env.example apps\web\.env
#    Lalu ganti JWT_ACCESS_SECRET & JWT_REFRESH_SECRET di apps/api/.env dengan string acak
#    (contoh: jalankan `openssl rand -hex 32` atau ketik acak minimal 32 karakter).

# 4. Nyalakan database (Docker Desktop harus sudah jalan)
pnpm db:up

# 5. Buat tabel & isi data awal Bekuin
pnpm db:migrate
pnpm db:seed

# 6. Jalankan API + web bersamaan
pnpm dev
```

Setelah itu buka:

| Alamat | Isi |
| --- | --- |
| http://localhost:5173 | Aplikasi web (login) |
| http://localhost:3000/api/docs | Dokumentasi API (Swagger) |
| http://localhost:3000/api/v1/health | Cek API & database |

**Akun awal:** `admin` / `admin12345` dan `staff` / `staff12345`. Saat login pertama, aplikasi akan meminta ganti password.

**Mencoba halaman pelanggan QR:** jalankan `pnpm db:studio`, buka tabel `dining_tables`, salin `qrToken` salah satu meja, lalu buka `http://localhost:5173/m/<qrToken>`.

## 3. Membuka dari HP (WiFi yang Sama)

1. Cari IP laptop: Windows `ipconfig` (IPv4 Address), macOS/Linux `ip addr` atau `ifconfig` (misal `192.168.1.10`).
2. Ubah `apps/web/.env`: `VITE_API_URL=http://192.168.1.10:3000/api/v1`
3. Ubah `apps/api/.env`: `CORS_ORIGIN=http://localhost:5173,http://192.168.1.10:5173`
4. Jalankan ulang `pnpm dev`, lalu buka `http://192.168.1.10:5173` di Chrome HP.
5. Bila tidak bisa dibuka, izinkan Node.js di firewall Windows (jaringan Private).

### Tes Printer Bluetooth & Install PWA (butuh HTTPS)

Web Bluetooth dan install PWA hanya jalan di **HTTPS** atau `localhost`. Cara termudah saat development adalah memakai Cloudflare Tunnel:

```bash
# install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
cloudflared tunnel --url http://localhost:3000   # catat URL https API-nya
cloudflared tunnel --url http://localhost:5173   # catat URL https web-nya
```

Isi `VITE_API_URL` dengan URL https API + `/api/v1`, dan tambahkan URL https web ke `CORS_ORIGIN` dan `PUBLIC_WEB_URL`. Setelah itu buka URL https web di Chrome Android, masuk ke **Admin → Lainnya → Printer → Hubungkan**, lalu **Tes Print**.

Vite perlu mengizinkan host tunnel. Bila muncul "Blocked request", tambahkan `allowedHosts: ['.trycloudflare.com']` di bagian `server` pada `apps/web/vite.config.ts`.

## 4. Perintah Harian

| Perintah | Fungsi |
| --- | --- |
| `pnpm dev` | Jalankan API (port 3000) + web (port 5173) |
| `pnpm dev:api` / `pnpm dev:web` | Jalankan salah satu saja |
| `pnpm db:up` / `pnpm db:down` | Nyalakan / matikan database |
| `pnpm db:migrate` | Terapkan perubahan `schema.prisma` (akan diminta nama migrasi) |
| `pnpm db:seed` | Isi data awal (aman diulang) |
| `pnpm db:reset` | **Hapus semua data**, migrasi ulang, dan seed |
| `pnpm db:studio` | Lihat & edit isi database di browser |
| `pnpm lint` / `pnpm format` | Cek gaya kode / rapikan otomatis |
| `pnpm typecheck` / `pnpm test` / `pnpm build` | Cek tipe / jalankan test / build produksi |
| `docker compose --profile tools up -d adminer` | UI database Adminer di http://localhost:8080 |

Sebelum commit, Husky otomatis menjalankan lint + format pada file yang berubah.

## 5. Masalah yang Sering Muncul

| Gejala | Solusi |
| --- | --- |
| `Konfigurasi .env tidak valid` saat API start | Pastikan `apps/api/.env` ada dan JWT secret minimal 32 karakter |
| `Can't reach database server at localhost:5432` | Docker Desktop belum jalan, atau jalankan `pnpm db:up` |
| Port 5432 sudah dipakai | Ada PostgreSQL lain di laptop. Matikan, atau ubah port di `docker-compose.yml` (misal `5433:5432`) dan `DATABASE_URL` |
| `Cannot find module '@bekuin/shared'` | Jalankan `pnpm --filter @bekuin/shared build` (otomatis di `pnpm dev`) |
| `@prisma/client did not initialize` | Jalankan `pnpm --filter @bekuin/api prisma:generate` |
| Login dari HP gagal "Tidak bisa terhubung ke server" | Cek `VITE_API_URL` memakai IP laptop, bukan `localhost`, dan `CORS_ORIGIN` sudah memuat alamat web |
| Tombol Hubungkan printer abu-abu | Bukan Chrome, atau bukan HTTPS/localhost |
| Printer tidak muncul di daftar | Printer mati/terhubung ke HP lain, atau printer hanya Bluetooth Classic (bukan BLE). Coba aplikasi RawBT sebagai fallback |
