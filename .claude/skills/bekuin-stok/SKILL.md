---
name: bekuin-stok
description: Aturan stok, uang, HPP, dan produksi Bekuin POS. Gunakan saat mengerjakan StockService, approve/void order, stok masuk, produksi, opname, CostingService, atau laporan laba.
---

# Aturan Stok, Uang, dan HPP

## Satuan & tipe data
- Uang jual (harga, subtotal, total, diskon, paidAmount) = `Int` rupiah.
- Biaya per gram/ml/pcs, qty bahan, stok bahan = `Decimal(14,4)` (Prisma `Decimal`). Hitung dengan `Prisma.Decimal`, jangan `number` untuk akumulasi biaya.
- Stok produk = `Int` pcs. Stok bahan = satuan dasar (`GRAM`, `ML`, `PCS`).

## StockService adalah satu-satunya pintu
- `increase(tx, item, qty, { type, unitCost, refType, refId, note, userId })` dan `decrease(...)`.
- Selalu dipanggil dengan `tx` dari `prisma.$transaction`. Kunci baris dulu: `SELECT id FROM products WHERE id = ANY($1) FOR UPDATE` (atau `ingredients`), urutkan id agar tidak deadlock.
- `decrease` menolak bila saldo akhir < 0 (kecuali setting `blockApproveOnLowStock = false` untuk stok produk).
- Setiap perubahan menulis satu baris `stock_movements` dengan `qtyChange` (+/−) dan `balanceAfter`. Baris mutasi tidak pernah di-update/dihapus.

## Approve order (satu transaksi)
1. Kunci order (`status = PENDING`), hitung ulang subtotal dari item.
2. Per item: kurangi stok produk `qty × packSize` pcs (Frozen & Siap Makan memotong produk yang sama), kurangi kemasan varian `qty × variantPackaging.qty`.
3. Snapshot `hppPerPack = packSize × biayaPerPcs + Σ kemasan` (biayaPerPcs = `avgCostPerPcs` bila > 0, selain itu HPP teoretis resep). `hppTotal = Σ qty × hppPerPack`.
4. Set status PAID, metode bayar, `approvedById/At`, `cashSessionId` (cash wajib shift terbuka), tulis `order_logs`.
5. Mutasi: `type = SALE`, `refType = ORDER`, `refId = order.id`.
- Void: kebalikan langkah 2 dengan `VOID_RETURN`; order tetap ada dengan status VOIDED.

## HPP (CostingService)
- Biaya per unit bahan setengah jadi = Σ(qty × biaya bahan) ÷ yieldQty resep (rekursif; tolak resep melingkar).
- HPP per pcs produk = Σ(qty per pcs × biaya per unit).
- HPP pack = packSize × HPP per pcs + Σ kemasan.
- Tabel PRD 7.5 membulatkan HPP per pcs ke **Rp10 terdekat** sebelum dikali pack (Udang Keju 2.156,69 → 2.160 → Frozen 6 = 6 × 2.160 + 3.300 = 16.260). Tes wajib cocok dengan tabel itu.
- Nilai acuan: Adonan Dasar 59,4675/g, Kulit Risol 316/pcs.

## Stok masuk & produksi
- Stok masuk: qtyBase = packQty × purchaseQty. Weighted average: (stokLama × hargaLama + qtyBaru × hargaBaru) ÷ (stokLama + qtyBaru). Update `lastPrice`.
- Produksi: kurangi bahan (`PRODUCTION_OUT`), tambah hasil (`PRODUCTION_IN`) dengan unitCost = total biaya aktual ÷ hasil aktual; `yieldVariance = actual − expected`; update `avgCostPerPcs` produk secara weighted average.
- Contoh uji: 60 pcs Udang Keju memotong adonan 1.500 g, keju oles 420 g, tepung roti 600 g.

## Laporan
- Omzet hanya dari order PAID (tanggal `approvedAt` WITA). VOIDED/REJECTED/CANCELLED tidak dihitung omzet.
- Laba kotor = omzet bersih − Σ hppTotal. Laba bersih = laba kotor − pengeluaran − nilai waste.
- Belanja bahan (`purchases`) = kas keluar di arus kas, bukan pengeluaran operasional.
