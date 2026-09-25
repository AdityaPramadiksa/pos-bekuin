---
name: bekuin-parser
description: Aturan parser pesan WhatsApp (tempel pesan) Bekuin POS. Gunakan saat mengerjakan OrderParserService, endpoint orders/import, atau UI Tempel Pesan.
---

# Aturan Parser Pesan WhatsApp

Parser = fungsi murni `parseOrderText(text, catalog, aliases, today) → ParsedBatch`, tanpa akses DB, agar mudah diuji.

## Langkah
1. Normalisasi: huruf kecil, rapikan spasi, buang emoji, samakan `psc`/`pc` → `pcs`.
2. Klasifikasi tiap baris:
   - **Header**: baris awal berisi `order`/`oderan`/`orderan`/`pesanan`. Kata `besok`/`bsk` = today+1, `lusa` = today+2.
   - **Item**: diawali `-`, `•`, `.`, `*`, atau `angka.`; atau baris yang nama produknya cocok.
   - **Pelanggan**: baris lain tanpa nama produk. Kata kategori di baris ini berlaku ke semua item di bawahnya.
3. Pencocokan produk (berurutan): alias persis (`product_aliases`) → kecocokan token → jarak edit ≤ 2 (Levenshtein). Gagal = MERAH.
4. Ukuran pack: angka `6`/`9` diikuti `pcs` (kurung opsional). Tidak tertulis = pack terkecil yang tersedia (KUNING). Ukuran tidak tersedia untuk produk itu (Risol 9) = MERAH.
5. Jumlah pack: `2x`, `x2`, `2 x` → 2; default 1.
6. Kategori: default FROZEN. `mateng`/`matang`/`digoreng`/`siap makan` → SIAP_MAKAN. Deteksi **setelah** nama produk dicocokkan dan hanya pada sisa teks, supaya "goreng" di "Dimsum Goreng Keju" tidak dianggap penanda.
7. Pelanggan yang muncul dua kali (nama ternormalisasi sama) digabung jadi satu order dan ditandai `merged: true`.

## Status baris
- OK (hijau): produk, ukuran, harga cocok.
- WARN (kuning): ukuran ditebak atau produk cocok secara fuzzy.
- ERROR (merah): produk tidak dikenal / ukuran tidak tersedia. Simpan semua dinonaktifkan selama ada ERROR.

## Uji terima
- Fixture `docs/fixtures/wa-order-sample.txt` → harus sama dengan `docs/fixtures/wa-order-expected.json`: 12 order, 21 pack, Rp510.000, semua item pelanggan Mahayuda = SIAP_MAKAN.
- Tambahkan kasus: "goreng keju" sebagai produk, pelanggan ganda, baris tanpa ukuran, typo `dimsam`.
