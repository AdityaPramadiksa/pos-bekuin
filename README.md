# Bekuin POS

Sistem order, approval, self-order QR meja, stok berbasis resep, HPP, dan laporan keuangan untuk usaha dimsum **Bekuin** (Frozen & Siap Makan).

- **Staff:** input order di layar POS, lalu order masuk ke antrian approval admin.
- **Admin:** approve order, pilih pembayaran (Cash / QRIS / Transfer), cetak struk Bluetooth 58mm, kelola menu, stok, dan laporan.
- **Pelanggan:** scan QR di meja, pesan & bayar QRIS dari HP sendiri, lalu lacak status pesanan (tanpa login).

Spesifikasi lengkap ada di [PRD.md](PRD.md). Panduan instalasi dari nol ada di [docs/SETUP.md](docs/SETUP.md).

## Stack

React 19 + Vite 7 + Tailwind 4 (PWA) · NestJS 11 · PostgreSQL 16 + Prisma 6 · Socket.IO · TypeScript · pnpm monorepo

```
apps/api         NestJS REST API + Prisma (schema, migrasi, seeder)
apps/web         React PWA: staff (POS), admin, pelanggan (QR)
packages/shared  Enum, tipe, skema Zod, util format
docs/            Panduan setup, fixture parser WhatsApp
```

## Mulai Cepat

Butuh: Node.js 22, pnpm 10, dan Docker Desktop (detail di [docs/SETUP.md](docs/SETUP.md)).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm db:up          # PostgreSQL di Docker
pnpm db:migrate     # buat tabel
pnpm db:seed        # data awal Bekuin
pnpm dev            # API :3000, web :5173
```

- Web: http://localhost:5173 — login `admin` / `admin12345` atau `staff` / `staff12345` (wajib ganti password saat login pertama)
- API docs: http://localhost:3000/api/docs

## Status

| Sprint | Fokus | Status |
| --- | --- | --- |
| 0 | Setup, skema DB, seeder, auth, layout, spike printer | ✅ Selesai |
| 1 | Pengguna, Menu (CRUD), Metode Bayar, Pengaturan Toko | ✅ Selesai |
| 2 | POS & Approval (bisa jualan) | ⏳ Berikutnya |
| 3 | Self-order QR meja & antrian dapur | |
| 4–8 | Resep/HPP, stok, pre-order WA, keuangan & laporan, deploy | |

Checklist lengkap ada di [PRD.md bagian 10](PRD.md#10-task-breakdown).
