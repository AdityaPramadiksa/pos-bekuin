import {
  FULFILLMENT_STATUS_LABEL,
  type FulfillmentStatus,
  nextFulfillment,
  ORDER_TYPE_LABEL,
  type OrderView,
} from '@bekuin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flame, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { timeAgo } from '@/features/orders/order-format';
import { api, errorMessage } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';

const COLUMNS: { status: FulfillmentStatus; title: string; action: string }[] = [
  { status: 'QUEUED', title: 'Antre', action: 'Mulai siapkan' },
  { status: 'PREPARING', title: 'Disiapkan', action: 'Tandai siap' },
  { status: 'READY', title: 'Siap', action: 'Sudah diserahkan' },
];
const PREV: Partial<Record<FulfillmentStatus, FulfillmentStatus>> = {
  PREPARING: 'QUEUED',
  READY: 'PREPARING',
};

export function KitchenPage() {
  const queue = useQuery({
    queryKey: ['kitchen'],
    queryFn: async () => (await api.get<OrderView[]>('/kitchen/queue')).data,
    refetchInterval: 30_000,
  });
  const [mobileColumn, setMobileColumn] = useState<FulfillmentStatus>('QUEUED');
  const byStatus = (s: FulfillmentStatus) =>
    (queue.data ?? []).filter((o) => o.fulfillmentStatus === s);

  return (
    <>
      <PageHeader title="Antrian Dapur" subtitle="Order lunas yang perlu disiapkan" />
      <div className="p-4 md:p-6">
        {queue.isPending ? (
          <LoadingState />
        ) : queue.isError ? (
          <ErrorState error={queue.error} onRetry={() => queue.refetch()} />
        ) : queue.data.length === 0 ? (
          <EmptyState
            title="Dapur kosong"
            description="Order yang sudah dibayar akan muncul di sini."
          />
        ) : (
          <>
            <div className="mb-3 md:hidden">
              <Chips
                value={mobileColumn}
                onChange={(v) => setMobileColumn(v as FulfillmentStatus)}
                options={COLUMNS.map((c) => ({
                  key: c.status,
                  label: c.title,
                  count: byStatus(c.status).length,
                }))}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {COLUMNS.map((col) => (
                <section
                  key={col.status}
                  className={cn(col.status !== mobileColumn && 'hidden md:block')}
                >
                  <h2 className="mb-2 hidden items-center gap-2 text-sm font-semibold text-stone-600 md:flex">
                    {col.title} <Badge>{byStatus(col.status).length}</Badge>
                  </h2>
                  <ul className="space-y-3">
                    {byStatus(col.status).map((o) => (
                      <li key={o.id}>
                        <KitchenCard order={o} action={col.action} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function KitchenCard({ order, action }: { order: OrderView; action: string }) {
  const queryClient = useQueryClient();
  const now = useNow(30_000);
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const next = nextFulfillment(order.fulfillmentStatus);
  const prev = PREV[order.fulfillmentStatus];
  const minutes = order.approvedAt
    ? Math.round((now - new Date(order.approvedAt).getTime()) / 60000)
    : 0;

  const move = useMutation({
    mutationFn: (status: FulfillmentStatus) =>
      api.patch(`/orders/${order.id}/fulfillment`, { status }),
    onSuccess: (_d, status) => {
      toast.success(`${order.orderNo}: ${FULFILLMENT_STATUS_LABEL[status]}`);
      void queryClient.invalidateQueries({ queryKey: ['kitchen'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div
      className={cn(
        'rounded-2xl bg-white p-3 shadow-sm',
        minutes >= 15 && order.fulfillmentStatus !== 'READY' && 'ring-2 ring-amber-400',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-tight font-bold">
            {order.table?.name ?? order.customerName ?? order.orderNo}
          </p>
          <p className="text-xs text-stone-500">
            {order.orderNo}
            {order.table && order.customerName ? ` · ${order.customerName}` : ''} ·{' '}
            {ORDER_TYPE_LABEL[order.type]}
          </p>
        </div>
        <span
          className={cn(
            'text-xs font-semibold',
            minutes >= 15 ? 'text-amber-700' : 'text-stone-500',
          )}
        >
          {order.approvedAt ? timeAgo(order.approvedAt, now) : ''}
        </span>
      </div>
      <ul className="mt-2 space-y-1">
        {order.items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <span className="w-7 font-bold">{i.qty}×</span>
            <span className="flex-1">
              {i.productName} isi {i.packSize}
              {i.note && <span className="block text-xs text-amber-800">↳ {i.note}</span>}
            </span>
            {i.categoryCode === 'SIAP_MAKAN' && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                <Flame className="size-3" /> Goreng
              </span>
            )}
          </li>
        ))}
      </ul>
      {order.note && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">{order.note}</p>
      )}
      <div className="mt-3 flex gap-2">
        {isAdmin && prev && (
          <Button
            variant="outline"
            size="icon"
            aria-label="Mundurkan status"
            disabled={move.isPending}
            onClick={() => move.mutate(prev)}
          >
            <Undo2 className="size-4" />
          </Button>
        )}
        {next && (
          <Button className="flex-1" loading={move.isPending} onClick={() => move.mutate(next)}>
            {action}
          </Button>
        )}
      </div>
    </div>
  );
}
