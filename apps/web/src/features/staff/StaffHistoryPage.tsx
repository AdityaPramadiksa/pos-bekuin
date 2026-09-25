import { ComingSoon } from '@/components/ComingSoon';
import { PageHeader } from '@/components/PageHeader';

export function StaffHistoryPage() {
  return (
    <>
      <PageHeader title="History Order" />
      <ComingSoon
        sprint="Sprint 2 (POS & Approval)"
        features={[
          'Daftar order milik sendiri, filter status & tanggal',
          'Edit/batal selama PENDING',
          'Notifikasi realtime saat order di-approve atau ditolak',
        ]}
      />
    </>
  );
}
