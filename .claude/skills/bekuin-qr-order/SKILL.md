---
name: bekuin-qr-order
description: Aturan self-order QR meja (role pelanggan tanpa login), endpoint /public, halaman lacak pesanan, dan antrian dapur Bekuin POS. Gunakan saat mengerjakan TablesModule, PublicModule, KitchenModule, atau halaman /m dan /o.
---

# Aturan Self-Order QR Meja

## Identitas pelanggan
- Pelanggan tidak punya akun. Saat memesan, identitasnya `qrToken` meja (12 karakter acak, `randomBytes(9).toString('base64url')`). Saat melacak, identitasnya `publicToken` order (cuid).
- Jangan pernah mengekspos `order.id`, data order lain, data user, HPP, atau stok angka persis ke endpoint publik. Stok cukup ditampilkan sebagai `available: boolean`.

## Endpoint publik (`@Public()` + ThrottlerGuard)
- `GET /public/tables/:qrToken/menu`: 404 bila token tidak ada / meja nonaktif. Sertakan `storeOpen` (setting `isStoreOpen` + `openingHours` WITA + `qrOrderingEnabled`). Menu hanya kategori `isCustomerVisible`, produk `isActive`, varian `isActive`.
- `POST /public/orders`:
  - Validasi: toko buka, meja aktif, item ≥ 1, qty 1–50 per item, varian ada & aktif & kategorinya tampil ke pelanggan, produk tidak `isAvailable = false`.
  - **Harga dari DB**, total dihitung server; tolak bila total > `qrMaxOrderTotal`.
  - Batas: 5 order / 10 menit per (qrToken + IP), maksimal 3 order PENDING per meja.
  - Simpan `source = QR_TABLE`, `type = DINE_IN | TAKEAWAY`, `tableId`, `createdById = null`, `customerName` wajib, `customerPhone` opsional (tautkan/buat `customers` bila diisi), `order_logs` dengan `userId = null`.
  - Balikan hanya `{ orderNo, publicToken, total }`.
- `POST /public/orders/:publicToken/payment-proof`: hanya saat PENDING; gambar jpg/png/webp ≤ 5 MB; simpan `paymentProofUrl`; emit `order.updated` ke `admins`.
- `POST /public/orders/:publicToken/cancel`: hanya saat PENDING dan belum ada bukti bayar.

## Realtime
- Pelanggan join room `order:<publicToken>` tanpa JWT. Server memvalidasi token ada di DB sebelum join.
- Emit `order.status` ke room itu setiap kali status bayar atau `fulfillmentStatus` berubah.

## Alur status yang dilihat pelanggan
PENDING → (admin approve QRIS) PAID+QUEUED → PREPARING → READY → HANDED_OVER. REJECTED menampilkan alasan.

## Antrian dapur
- `fulfillmentStatus` hanya boleh maju satu langkah: QUEUED → PREPARING → READY → HANDED_OVER (staff & admin). Mundur hanya oleh admin.
- Isi `preparingAt`, `readyAt`, `handedOverAt` untuk laporan layanan.
- Hanya order PAID yang masuk antrian dapur.

## QR
- URL QR: `${PUBLIC_WEB_URL}/m/${qrToken}`. Rotate = token baru, token lama langsung 404.
