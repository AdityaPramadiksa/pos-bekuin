# Fixture Parser Pesan WhatsApp

Folder ini untuk uji terima parser Tempel Pesan (PRD 5.12, Sprint 6).

Isi dua file berikut dengan **pesanan WhatsApp nyata** Bekuin (12 pelanggan):

- `wa-order-sample.txt` — teks pesanan persis seperti yang di-copy dari WhatsApp (jangan dirapikan).
- `wa-order-expected.json` — hasil yang diharapkan: 12 order, 21 pack, total Rp510.000, semua item Mahayuda berkategori `SIAP_MAKAN`.

Contoh bentuk `wa-order-expected.json`:

```json
{
  "deliveryOffsetDays": 1,
  "totals": { "orders": 12, "packs": 21, "amount": 510000 },
  "orders": [
    {
      "customerName": "Bu Kusuma",
      "items": [{ "product": "Udang Keju", "category": "FROZEN", "packSize": 6, "qty": 1, "price": 22000 }]
    }
  ]
}
```
