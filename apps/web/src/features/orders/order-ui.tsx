import {
  FULFILLMENT_STATUS_LABEL,
  type FulfillmentStatus,
  ORDER_STATUS_LABEL,
  type OrderStatus,
  type OrderView,
  SOURCE_LABEL,
} from '@bekuin/shared';
import { Badge } from '@/components/ui/badge';

const STATUS_TONE: Record<OrderStatus, 'amber' | 'green' | 'red' | 'neutral'> = {
  PENDING: 'amber',
  PAID: 'green',
  REJECTED: 'red',
  CANCELLED: 'neutral',
  VOIDED: 'red',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}

export function FulfillmentBadge({ status }: { status: FulfillmentStatus }) {
  const tone =
    status === 'READY'
      ? 'green'
      : status === 'PREPARING'
        ? 'blue'
        : status === 'HANDED_OVER'
          ? 'neutral'
          : 'amber';
  return <Badge tone={tone}>{FULFILLMENT_STATUS_LABEL[status]}</Badge>;
}

export function SourceBadge({ order }: { order: Pick<OrderView, 'source' | 'table'> }) {
  if (order.source === 'QR_TABLE')
    return <Badge tone="blue">QR · {order.table?.name ?? 'Meja'}</Badge>;
  return (
    <Badge tone={order.source === 'WA_IMPORT' ? 'green' : 'neutral'}>
      {SOURCE_LABEL[order.source]}
    </Badge>
  );
}
