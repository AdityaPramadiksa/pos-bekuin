---
name: bekuin-qr-order
description: Aturan self-order QR meja & link order online (pelanggan tanpa login), endpoint /public, halaman lacak pesanan, halaman Diproses, dan webhook QRIS otomatis (notifikasi DANA) Bekuin POS. Gunakan saat mengerjakan TablesModule, PublicModule, ProcessingService, PaymentNotificationsModule, atau halaman /m, /pesan, dan /o.
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
  - Batas: 10 percobaan / 10 menit per (qrToken + IP) termasuk yang gagal validasi (`PublicThrottlerGuard`), maksimal 3 order PENDING per meja (dikunci `FOR UPDATE` pada baris meja).
  - Simpan `source = QR_TABLE`, `type = DINE_IN | TAKEAWAY`, `tableId`, `createdById = null`, `customerName` wajib, `customerPhone` opsional (tautkan/buat `customers` bila diisi), `order_logs` dengan `userId = null`.
  - `paymentMethodId` wajib: hanya metode `isActive` + `showToCustomer` (bawaan QRIS & Cash). Disimpan di order; `payAtCashier = type CASH`.
  - QRIS: `uniqueCode` 1–99 (`pickUniqueCode`, dikunci advisory lock) agar nominal `total + uniqueCode` tidak sama dengan order QRIS PENDING lain.
  - Balikan hanya `{ orderNo, publicToken, total }`.
- `POST /public/orders/:publicToken/payment-proof`: hanya saat PENDING; gambar jpg/png/webp ≤ 5 MB; simpan `paymentProofUrl`; emit `order.updated` ke `admins`.
- `POST /public/orders/:publicToken/cancel`: hanya saat PENDING dan belum ada bukti bayar.

## Realtime
- Pelanggan join room `order:<publicToken>` tanpa JWT. Server memvalidasi token ada di DB sebelum join.
- Emit `order.status` ke room itu setiap kali status bayar atau `fulfillmentStatus` berubah.

## Alur status yang dilihat pelanggan
PENDING → (admin setujui / QRIS terdeteksi) PAID + PROCESSING ("Diproses") → PAID + DONE: "Dikirim" bila `deliveryMethod = DELIVERY`, selain itu "Siap diambil" (`finalStage` di shared). REJECTED menampilkan alasan. `isPaid` = `paidAt` terisi (COD bisa diproses sebelum dibayar).

## Halaman Diproses (pengganti antrian dapur & packing)
- `GET /processing`: order PAID + PROCESSING (semua tanggal kirim) dan yang DONE hari ini. Rangkuman item dihitung `summarizeProcessing` (shared).
- `PATCH /orders/:id/fulfillment`: PROCESSING → DONE (staff & admin, isi `completedAt`); DONE → PROCESSING hanya admin.
- `POST /orders/:id/mark-paid` (admin): order disetujui yang `paidAt` null → lunas; cash wajib shift terbuka dan masuk shift saat itu.

## QRIS otomatis (notifikasi DANA lewat MacroDroid)
- `POST /public/payment-notifications/:key` (`@Public` + throttle 30/menit). Kunci = `settings.paymentWebhookKey` (acak, rotate lewat `POST /payment-notifications/rotate-key`, hanya admin yang bisa melihat di `GET /payment-notifications/setup`).
- `parsePaymentNotification` (fungsi murni, teruji): hanya uang masuk; uang keluar/top up/cashback diabaikan. Nominal harus sama persis dengan `total + uniqueCode` tepat satu order PENDING ber-QRIS (3 hari terakhir); lebih dari satu → AMBIGUOUS, tidak disetujui.
- Setuju otomatis memakai `approveInTx(..., userId = null, { allowNegativeStock: true })` di bawah advisory lock 7_240_003; duplikat 10 menit diabaikan. Semua notifikasi dicatat di `payment_notifications`. Emit `order.autoApproved` ke admin (bunyi + cetak struk bila printer terhubung).

## QR
- URL QR: `${PUBLIC_WEB_URL}/m/${qrToken}`. Rotate = token baru, token lama langsung 404.

## Link order online
- `GET /public/online/:onlineToken/menu` & `POST /public/online-orders`: token = `settings.onlineOrderToken` (acak 12 karakter, bisa di-rotate lewat `POST /settings/online-link/rotate`). Token salah → 404; `onlineOrderingEnabled = false` → 403.
- Wajib No. WA (dinormalkan `normalizePhone`), `deliveryMethod` PICKUP/DELIVERY (alamat wajib bila DELIVERY), `deliveryDate` dalam `onlineDateWindow` (hari ini hanya saat toko buka, maks. 14 hari).
- Ongkir `calcDeliveryFee` (shared) disimpan di `orders.deliveryFee` dan masuk `total`; approve menghitung `total = subtotal − diskon + deliveryFee`.
- Batas 3 PENDING per No. WA (advisory lock per nomor). Sumber `ONLINE` diperlakukan sama dengan `QR_TABLE` (`isCustomerSource`): dikunci saat approval, bisa batal/unggah bukti oleh pelanggan.

## Pembayaran & approval
- `GET /public/orders/:publicToken` menyertakan `payment` (tipe, nominal = total + kode unik, `qrisPayload` bernominal dari `settings.qrisPayload` lewat `qrisWithAmount`). Jangan pernah mengirim `order.id`.
- `settings.qrisPayload` hanya QRIS **statis** dengan CRC valid (`qrisInfo`); web membacanya otomatis dari gambar QRIS yang diunggah.
- Approve order pelanggan (`QR_TABLE`/`ONLINE`): item/jumlah dan diskon tidak boleh berubah (`assertCustomerOrderUnchanged`), juga lewat `PATCH /orders/:id`. Metode default = pilihan pelanggan; QRIS pelanggan dicatat `paidAmount = total + uniqueCode`. Omzet tetap memakai `total`.
- Bukti bayar opsional; unggah hanya untuk metode non-Cash.

