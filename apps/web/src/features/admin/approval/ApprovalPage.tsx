import type { OrderSource, OrderView } from '@bekuin/shared';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Chips } from '@/components/ui/chips';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { OrderCard } from '@/features/orders/OrderCard';
import { dateKeyWita, formatDateKey } from '@/features/orders/order-format';
import { BulkApproveBar } from '@/features/preorder/BulkApproveBar';
import { useOrders } from '@/lib/queries';
import { ApproveDialog } from './ApproveDialog';

export function ApprovalPage() {
  const [source, setSource] = useState<'' | OrderSource>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Antrian: terlama di atas. Realtime via socket + polling cadangan 30 detik.
  const all = useOrders(
    { status: 'PENDING', sort: 'oldest', limit: 300 },
    { refetchInterval: 30_000 },
  );
  const items = (all.data?.items ?? []).filter((o) => !source || o.source === source);
  const count = (s: OrderSource) => all.data?.items.filter((o) => o.source === s).length ?? 0;

  // Kelompokkan per tanggal kirim (hari ini dulu, lalu pre-order).
  const groups = new Map<string, OrderView[]>();
  for (const o of items) groups.set(o.deliveryDate, [...(groups.get(o.deliveryDate) ?? []), o]);
  const today = dateKeyWita(0);
  const toggle = (id: string) =>
    setChecked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selected = items.filter((o) => checked.has(o.id));

  return (
    <>
      <PageHeader
        title="Approval"
        subtitle={all.data ? `${all.data.total} order menunggu` : 'Antrian order'}
      />
      <div className="mx-auto max-w-2xl space-y-3 p-4 pb-40 md:p-6 md:pb-40">
        <Chips
          value={source}
          onChange={(v) => setSource(v as typeof source)}
          options={[
            { key: '', label: 'Semua', count: all.data?.total },
            { key: 'POS', label: 'POS', count: count('POS') },
            { key: 'QR_TABLE', label: 'QR Meja', count: count('QR_TABLE') },
            { key: 'ONLINE', label: 'Online', count: count('ONLINE') },
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
          [...groups]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, orders]) => (
              <section key={date} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <h2 className="text-xs font-semibold tracking-wide text-stone-500 uppercase">
                    {date === today
                      ? 'Hari ini'
                      : date < today
                        ? `Terlambat · ${formatDateKey(date)}`
                        : `Kirim ${formatDateKey(date)}`}{' '}
                    ({orders.length})
                  </h2>
                  <button
                    className="text-brand-700 ml-auto text-xs font-medium"
                    onClick={() =>
                      setChecked((s) => {
                        const next = new Set(s);
                        const allOn = orders.every((o) => next.has(o.id));
                        for (const o of orders) {
                          if (allOn) next.delete(o.id);
                          else next.add(o.id);
                        }
                        return next;
                      })
                    }
                  >
                    {orders.every((o) => checked.has(o.id)) ? 'Batal pilih' : 'Pilih semua'}
                  </button>
                </div>
                <ul className="space-y-2">
                  {orders.map((o) => (
                    <li key={o.id} className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        aria-label={`Pilih ${o.orderNo}`}
                        className="mt-4 size-4"
                        checked={checked.has(o.id)}
                        onChange={() => toggle(o.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <OrderCard
                          order={o}
                          showAge
                          selected={checked.has(o.id)}
                          onClick={() => setSelectedId(o.id)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))
        )}
      </div>
      <ApproveDialog orderId={selectedId} onClose={() => setSelectedId(null)} />
      <BulkApproveBar selected={selected} onDone={() => setChecked(new Set())} />
    </>
  );
}
