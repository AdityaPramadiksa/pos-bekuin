import { ComingSoon } from '@/components/ComingSoon';
import { PageHeader } from '@/components/PageHeader';

export function StaffOrderPage() {
  return (
    <>
      <PageHeader title="Order Baru" subtitle="Layar POS staff" />
      <ComingSoon
        sprint="Sprint 2 (POS & Approval)"
        features={[
          'Toggle kategori Frozen | Siap Makan, kartu produk dengan stepper per varian',
          'Stok tersedia di kartu, tombol + nonaktif bila stok kurang',
          'Keranjang persisten (localStorage), nama pelanggan, catatan, tanggal kirim',
          'Tablet/desktop: grid produk + panel keranjang berdampingan',
          'Kirim ke Admin → order PENDING',
          'Sprint 6: mode Tempel Pesan WhatsApp',
        ]}
      />
    </>
  );
}
