import { ComingSoon } from '@/components/ComingSoon';
import { PageHeader } from '@/components/PageHeader';

export function AdminOrdersPage() {
  return (
    <>
      <PageHeader title="Order" />
      <ComingSoon
        sprint="Sprint 2, 3, 6"
        features={[
          'Semua transaksi: filter tanggal, status, sumber, staff, metode bayar',
          'Buat order langsung (admin jualan), cetak ulang struk, void + alasan',
          'Antrian Dapur: Antre → Disiapkan → Siap → Diserahkan',
          'Tempel Pesan, Rekap Produksi, Packing & Tagihan (Sprint 6)',
        ]}
      />
    </>
  );
}
