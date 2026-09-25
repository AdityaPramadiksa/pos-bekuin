import {
  DELIVERY_METHOD_LABEL,
  isUnpaid,
  ORDER_STAGE_LABEL,
  type OrderStage,
  orderStage,
  type OrderView,
  SOURCE_LABEL,
} from '@bekuin/shared';
import { Badge } from '@/components/ui/badge';

const STAGE_TONE: Record<OrderStage, 'amber' | 'green' | 'red' | 'neutral' | 'blue' | 'brand'> = {
  PENDING: 'amber',
  PROCESSING: 'blue',
  SHIPPED: 'green',
  READY_PICKUP: 'green',
  DONE: 'green',
  REJECTED: 'red',
  CANCELLED: 'neutral',
  VOIDED: 'red',
};

type StageOrder = Pick<
  OrderView,
  'status' | 'fulfillmentStatus' | 'source' | 'deliveryMethod' | 'paidAt'
>;

/** Menunggu persetujuan → Diproses → Dikirim / Siap diambil / Selesai (+ Belum dibayar). */
export function StatusBadge({ order }: { order: StageOrder }) {
  const stage = orderStage(order);
  return (
    <>
      <Badge tone={STAGE_TONE[stage]}>{ORDER_STAGE_LABEL[stage]}</Badge>
      {isUnpaid(order) && <UnpaidBadge />}
    </>
  );
}

export function UnpaidBadge() {
  return <Badge tone="red">Belum dibayar</Badge>;
}

export function SourceBadge({
  order,
}: {
  order: Pick<OrderView, 'source' | 'table'> & { deliveryMethod?: OrderView['deliveryMethod'] };
}) {
  if (order.source === 'QR_TABLE')
    return <Badge tone="blue">QR · {order.table?.name ?? 'Meja'}</Badge>;
  if (order.source === 'ONLINE')
    return (
      <Badge tone="brand">
        Online{order.deliveryMethod ? ` · ${DELIVERY_METHOD_LABEL[order.deliveryMethod]}` : ''}
      </Badge>
    );
  return (
    <Badge tone={order.source === 'WA_IMPORT' ? 'green' : 'neutral'}>
      {SOURCE_LABEL[order.source]}
    </Badge>
  );
}
