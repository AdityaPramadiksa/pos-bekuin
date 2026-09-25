import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Chips } from '@/components/ui/chips';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { OrderCard } from '@/features/orders/OrderCard';
import { OrderDetailDialog } from '@/features/orders/OrderDetailDialog';
import { dateKeyWita } from '@/features/orders/order-format';
import { useOrders } from '@/lib/queries';

const RANGES = [
  { key: 'today', label: 'Hari ini', from: () => dateKeyWita(0), to: () => dateKeyWita(0) },
  { key: 'yesterday', label: 'Kemarin', from: () => dateKeyWita(-1), to: () => dateKeyWita(-1) },
  { key: 'week', label: '7 hari', from: () => dateKeyWita(-6), to: () => dateKeyWita(0) },
  { key: 'tomorrow', label: 'Kirim besok', from: () => dateKeyWita(1), to: () => dateKeyWita(1) },
] as const;
const STATUSES = [
  { key: '', label: 'Semua' },
  { key: 'PENDING', label: 'Menunggu' },
  { key: 'PAID', label: 'Disetujui' },
  { key: 'REJECTED,CANCELLED', label: 'Batal/Ditolak' },
];

export function StaffHistoryPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('today');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const r = RANGES.find((x) => x.key === range)!;
  const orders = useOrders({
    mine: true,
    from: r.from(),
    to: r.to(),
    status,
    dateField: range === 'tomorrow' ? 'delivery' : 'created',
  });

  const totalPaid = (orders.data?.items ?? [])
    .filter((o) => o.status === 'PAID')
    .reduce((s, o) => s + o.total, 0);

  return (
    <>
      <PageHeader
        title="History Order"
        subtitle={orders.data ? `${orders.data.total} order` : undefined}
      />
      <div className="mx-auto max-w-2xl space-y-3 p-4 md:p-6">
        <Chips
          options={RANGES.map((x) => ({ key: x.key, label: x.label }))}
          value={range}
          onChange={(v) => setRange(v as typeof range)}
        />
        <Chips options={STATUSES} value={status} onChange={setStatus} />
        {orders.isPending ? (
          <LoadingState />
        ) : orders.isError ? (
          <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
        ) : orders.data.items.length === 0 ? (
          <EmptyState
            title="Belum ada order"
            description="Order yang kamu kirim akan muncul di sini."
          />
        ) : (
          <>
            {totalPaid > 0 && (
              <p className="text-sm text-stone-600">
                Total disetujui:{' '}
                <b>
                  {totalPaid.toLocaleString('id-ID', {
                    style: 'currency',
                    currency: 'IDR',
                    maximumFractionDigits: 0,
                  })}
                </b>
              </p>
            )}
            <ul className="space-y-2">
              {orders.data.items.map((o) => (
                <li key={o.id}>
                  <OrderCard order={o} onClick={() => setSelected(o.id)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <OrderDetailDialog orderId={selected} onClose={() => setSelected(null)} />
    </>
  );
}
