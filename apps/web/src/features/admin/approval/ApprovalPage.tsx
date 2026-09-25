import type { OrderSource } from '@bekuin/shared';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { OrderCard } from '@/features/orders/OrderCard';
import { Chips } from '@/components/ui/chips';
import { useOrders } from '@/lib/queries';
import { ApproveDialog } from './ApproveDialog';

export function ApprovalPage() {
  const [source, setSource] = useState<'' | OrderSource>('');
  const [selected, setSelected] = useState<string | null>(null);
  // Antrian: terlama di atas. Realtime via socket + polling cadangan 30 detik.
  const all = useOrders(
    { status: 'PENDING', sort: 'oldest', limit: 200 },
    { refetchInterval: 30_000 },
  );
  const items = (all.data?.items ?? []).filter((o) => !source || o.source === source);
  const count = (s: OrderSource) => all.data?.items.filter((o) => o.source === s).length ?? 0;

  return (
    <>
      <PageHeader
        title="Approval"
        subtitle={all.data ? `${all.data.total} order menunggu` : 'Antrian order'}
      />
      <div className="mx-auto max-w-2xl space-y-3 p-4 md:p-6">
        <Chips
          value={source}
          onChange={(v) => setSource(v as typeof source)}
          options={[
            { key: '', label: 'Semua', count: all.data?.total },
            { key: 'POS', label: 'POS', count: count('POS') },
            { key: 'QR_TABLE', label: 'QR Meja', count: count('QR_TABLE') },
            { key: 'WA_IMPORT', label: 'WhatsApp', count: count('WA_IMPORT') },
            { key: 'ADMIN', label: 'Admin', count: count('ADMIN') },
          ]}
        />
        {all.isPending ? (
          <LoadingState />
        ) : all.isError ? (
          <ErrorState error={all.error} onRetry={() => all.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Tidak ada order menunggu"
            description="Order baru dari staff atau pelanggan QR akan muncul di sini dengan bunyi notifikasi."
          />
        ) : (
          <ul className="space-y-2">
            {items.map((o) => (
              <li key={o.id}>
                <OrderCard order={o} showAge onClick={() => setSelected(o.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <ApproveDialog orderId={selected} onClose={() => setSelected(null)} />
    </>
  );
}
