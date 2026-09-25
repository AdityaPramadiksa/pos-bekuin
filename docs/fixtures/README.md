# Fixture Parser Pesan WhatsApp

Dipakai unit test `apps/api/src/order-import/parser.spec.ts` (PRD 5.12).

- `wa-order-sample.txt` — teks pesanan seperti di-copy dari WhatsApp.
- `wa-order-expected.json` — hasil yang diharapkan: 12 order, 21 pack, Rp510.000, semua item Mahayuda `SIAP_MAKAN`.

> ⚠️ Isi saat ini adalah **contoh buatan** yang disusun ulang dari tabel PRD 5.13 (rekap produksi 138 pcs),
> lengkap dengan kasus uji: header `Oderan bsk`, pelanggan ganda (Bu Ayu), typo (`Udng keju`), alias ejaan (`Dimsam ori`),
> ukuran tanpa tulisan (Bu Dewi), `psc`, `x2`/`2x`, alias `goreng keju`/`udang`, penanda `mateng/digoreng`.
> Ganti dengan pesanan WhatsApp **asli** Bekuin agar parser teruji terhadap gaya tulis pelanggan sebenarnya,
> lalu sesuaikan `wa-order-expected.json`.
