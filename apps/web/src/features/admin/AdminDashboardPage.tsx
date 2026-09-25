import { ComingSoon } from '@/components/ComingSoon';
import { PageHeader } from '@/components/PageHeader';
import { useAuthStore } from '@/stores/auth';

export function AdminDashboardPage() {
  const user = useAuthStore((s) => s.user);
  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Halo, ${user?.name ?? 'Admin'}`} />
      <ComingSoon
        sprint="Sprint 7 (Keuangan & Laporan)"
        features={[
          'Omzet, jumlah order, laba kotor & laba bersih hari ini',
          'Badge order PENDING (POS + QR meja)',
          'Peringatan stok menipis, kartu "Besok" untuk pre-order',
          'Grafik penjualan 7 hari, status shift kasir',
        ]}
      />
    </>
  );
}
