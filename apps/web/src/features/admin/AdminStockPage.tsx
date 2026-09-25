import { ComingSoon } from '@/components/ComingSoon';
import { PageHeader } from '@/components/PageHeader';

export function AdminStockPage() {
  return (
    <>
      <PageHeader title="Stok" />
      <ComingSoon
        sprint="Sprint 2 (stok produk) + Sprint 5 (stok lengkap)"
        features={[
          'Stok Produk (pcs) dengan status aman/menipis/habis, penyesuaian manual',
          'Stok Bahan Baku, Stok Masuk (belanja), Produksi, Stok Opname',
          'Riwayat Mutasi Stok (audit trail)',
        ]}
      />
    </>
  );
}
