import { ComingSoon } from '@/components/ComingSoon';
import { PageHeader } from '@/components/PageHeader';

export function AdminApprovalPage() {
  return (
    <>
      <PageHeader title="Approval" subtitle="Antrian order PENDING" />
      <ComingSoon
        sprint="Sprint 2 (POS & Approval) + Sprint 3 (QR Meja)"
        features={[
          'Antrian realtime + suara, terlama di atas; badge sumber: POS / QR Meja / WA',
          'Ubah qty/hapus item, diskon, pilih metode bayar: Cash (kembalian), Transfer, QRIS',
          'Order QR: lihat bukti bayar pelanggan sebelum approve',
          'Approve & Print (satu transaksi DB), Reject + alasan',
          'Sprint 6: approve massal per tanggal kirim',
        ]}
      />
    </>
  );
}
