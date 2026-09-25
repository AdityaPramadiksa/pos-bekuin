import { formatRupiah, type OrderView } from '@bekuin/shared';
import { ImageIcon } from 'lucide-react';
import { useNow } from '@/lib/useNow';
import { cn } from '@/lib/utils';
import { FulfillmentBadge, SourceBadge, StatusBadge } from './order-ui';
import { formatTime, itemsSummary, timeAgo } from './order-format';

export function OrderCard({
  order,
  onClick,
  showAge,
  selected,
}: {
  order: OrderView;
  onClick: () => void;
  showAge?: boolean;
  selected?: boolean;
}) {
  const now = useNow();
  const oldPending =
    order.status === 'PENDING' && now - new Date(order.createdAt).getTime() > 30 * 60_000;
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-transparent transition hover:ring-stone-200',
        selected && 'ring-brand-600 ring-2',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold">{order.customerName ?? order.orderNo}</span>
            <SourceBadge order={order} />
            {order.payAtCashier && order.status === 'PENDING' && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                Bayar di kasir
              </span>
            )}
            {order.paymentProofUrl && order.status === 'PENDING' && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                <ImageIcon className="size-3" /> Bukti bayar
              </span>
            )}
          </div>
          <p className="text-xs text-stone-500">
            {order.orderNo} ·{' '}
            {showAge ? timeAgo(order.createdAt, now) : formatTime(order.createdAt)}
            {order.createdBy ? ` · ${order.createdBy.name}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold tabular-nums">{formatRupiah(order.total)}</p>
          <div className="mt-0.5 flex justify-end gap-1">
            <StatusBadge status={order.status} />
            {order.status === 'PAID' && order.fulfillmentStatus !== 'HANDED_OVER' && (
              <FulfillmentBadge status={order.fulfillmentStatus} />
            )}
          </div>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-stone-700">{itemsSummary(order)}</p>
      {oldPending && (
        <p className="mt-1 text-xs font-medium text-amber-700">Menunggu lebih dari 30 menit</p>
      )}
    </button>
  );
}
