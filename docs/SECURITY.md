# Keamanan Bekuin POS

Ringkasan pengamanan yang sudah ada dan hasil audit Sprint 8 (dasar OWASP Top 10).

## Autentikasi & hak akses

- Password di-hash **bcrypt**. Akun baru dan hasil reset wajib ganti password saat login pertama.
- **JWT access 15 menit + refresh token berputar** (disimpan sebagai hash; refresh lama langsung tidak berlaku). Ganti password mencabut semua sesi.
- **Guard global**: semua endpoint wajib login kecuali yang diberi `@Public()` (login/refresh/logout, health, dan endpoint pelanggan QR).
- Endpoint admin memakai `@Roles('ADMIN')` di server. Menyembunyikan menu di web hanya kosmetik.
- Staff hanya bisa melihat order buatannya sendiri.

## Endpoint publik (pelanggan QR)

- Hanya menerima `qrToken` meja (acak 12 karakter) atau `publicToken` order (cuid). Tidak pernah mengekspos id internal, HPP, data user, atau angka stok.
- **Harga & total selalu dihitung server** dari varian di database. Total maksimal diatur di Pengaturan.
- Rate limit per IP + token: 10 percobaan order / 10 menit, 60 lihat menu / menit, 10 unggah bukti / 10 menit. Maksimal 3 order PENDING per meja.
- Unggah bukti bayar: hanya jpg/png/webp ≤ 5 MB, dicek dari **isi file (magic bytes)**, bukan dari nama/ekstensi, lalu disimpan dengan nama acak.
- Realtime pelanggan: `order.watch` memvalidasi token ke DB dan dibatasi 20 kali per koneksi.

## Rate limit lain

| Endpoint | Batas |
| --- | --- |
| `POST /auth/login` | 5 / menit / IP |
| `POST /auth/refresh`, `/auth/logout` | 30 / menit / IP |
| Endpoint publik | lihat di atas |

Di belakang proxy (Caddy/Railway), set `TRUST_PROXY=1` agar IP asli pelanggan terbaca. Tanpa itu semua pelanggan dianggap satu IP.

## Transport & header

- **HTTPS wajib** di produksi (Caddy + Let's Encrypt, atau platform). HTTP otomatis diarahkan ke HTTPS; ada HSTS.
- API: `helmet` (nosniff, frameguard, dll.). Web (Caddy): CSP ketat (`script-src 'self'`, tanpa skrip pihak ketiga), `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- **CORS** HTTP dan Socket.IO hanya untuk origin di `CORS_ORIGIN`.
- Swagger `/api/docs` mati di production (aktifkan sementara dengan `SWAGGER_ENABLED=true` bila perlu).

## Data & input

- Semua body divalidasi `class-validator` (`whitelist` + `forbidNonWhitelisted`); field asing ditolak.
- Query SQL mentah hanya lewat tagged template Prisma (`$queryRaw\`...\``) yang otomatis ter-parameter. Tidak ada `$queryRawUnsafe`.
- Uang disimpan sebagai `Int` rupiah; perubahan stok hanya lewat `StockService` di dalam transaksi dengan kunci baris.
- Export CSV mencegah *formula injection* (sel yang diawali `= + - @` diberi tanda kutip).
- Web Push: endpoint langganan hanya boleh ke layanan push resmi (Google/Mozilla/Apple/Microsoft) untuk mencegah SSRF.

## Konfigurasi

- API menolak start di production bila `JWT_*_SECRET` masih contoh, kurang dari 32 karakter, atau access = refresh.
- File `.env` / `deploy/.env` tidak pernah di-commit (`.gitignore`).
- Container API berjalan sebagai user non-root (`node`).

## Audit

- Setiap perubahan status order tercatat di `order_logs` (siapa, kapan, alasan). Setiap mutasi stok tercatat di `stock_movements` (tidak pernah diubah/dihapus).
- Data master memakai soft delete (`isActive`).

## Yang perlu dijaga pemilik

- Pakai password kuat untuk admin; jangan berbagi akun admin dengan staff.
- Nonaktifkan akun staff yang berhenti (Lainnya → Pengguna).
- Rotasi QR meja (Meja & QR → Ganti QR) bila QR lama disalahgunakan.
- Simpan backup di luar VPS dan uji restore berkala ([DEPLOY.md](DEPLOY.md#backup--restore)).
- Perbarui aplikasi & image Docker berkala (`git pull` lalu `up -d --build`).
