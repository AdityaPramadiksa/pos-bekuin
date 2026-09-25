# CLAUDE.md — Aturan Kerja Proyek Bekuin POS

Baca `PRD.md` untuk spesifikasi. Kerjakan task sesuai urutan sprint di PRD bagian 10, lalu centang checklist-nya setelah selesai.

## Struktur

- `apps/api` — NestJS 11 (CommonJS). Satu folder per modul: `x.module.ts`, `x.controller.ts`, `x.service.ts`, `dto/`.
- `apps/api/prisma/schema.prisma` — sumber kebenaran model data. Ubah skema → `pnpm db:migrate` (beri nama migrasi yang jelas) → perbarui seeder bila perlu.
- `apps/web` — React 19 + Vite. Kode per fitur di `src/features/<fitur>/`. Alias impor `@/` = `src/`.
- `packages/shared` — enum, tipe, skema Zod, util yang dipakai API & web. Setelah mengubah, jalankan `pnpm --filter @bekuin/shared build`.

## Perintah

- `pnpm dev`, `pnpm lint`, `pnpm format`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:reset`, `pnpm db:studio`
- Sebelum menyatakan selesai: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` harus hijau.

## Aturan Wajib

1. **Uang:** harga & total = `Int` rupiah. Biaya per unit = `Decimal(14,4)`. Jangan pakai float untuk rupiah yang disimpan.
2. **Stok:** hanya `StockService` yang boleh mengubah kolom stok, selalu di dalam transaksi dengan kunci baris dan mencatat `stock_movements`. Detail: `.claude/skills/bekuin-stok/SKILL.md`.
3. **Order:** semua sumber (POS, QR, WA) masuk PENDING. Stok terpotong hanya saat approve. Harga & total selalu dihitung ulang di server dari varian, bukan dari klien.
4. **Keamanan:** guard global mewajibkan login. Endpoint pelanggan wajib `@Public()` + rate limit + hanya menerima `qrToken`/`publicToken`. Detail: `.claude/skills/bekuin-qr-order/SKILL.md`.
5. **Role:** endpoint admin diberi `@Roles('ADMIN')`. Menyembunyikan menu di frontend bukan pengaman.
6. **Waktu:** simpan UTC; tanggal bisnis (nomor order, laporan, tanggal kirim) memakai `Asia/Makassar` (`businessDateKey` di shared).
7. **Audit:** perubahan status order ditulis ke `order_logs`. Data master memakai soft delete (`isActive`).
8. **Parser WA:** fungsi murni yang teruji fixture; aturannya di `.claude/skills/bekuin-parser/SKILL.md`.

## Gaya

- Bahasa UI, pesan error, dan komentar: **Bahasa Indonesia**. Nama kode (variabel, fungsi, tabel): Inggris.
- TypeScript strict, tanpa `any` kecuali terpaksa. DTO pakai class-validator + dekorator Swagger.
- UI mobile-first (360 px), dengan state loading, kosong, dan error. Komponen UI dasar: shadcn/ui (`pnpm dlx shadcn@latest add <komponen>` di `apps/web`).
- Logika stok/uang/parser wajib punya unit test.
