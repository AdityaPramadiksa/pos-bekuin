import { Prisma } from '@prisma/client';
import type { OrderEvent, OrderView } from '@bekuin/shared';

export const orderInclude = {
  items: {
    include: { variant: { select: { productId: true } } },
    orderBy: [{ categoryCode: 'asc' }, { productName: 'asc' }],
  },
  table: { select: { id: true, code: true, name: true } },
  paymentMethod: { select: { id: true, name: true, type: true } },
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} satisfies Prisma.OrderInclude;

export const orderDetailInclude = {
  ...orderInclude,
  logs: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type OrderDetailRow = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

const iso = (d: Date | null) => d?.toISOString() ?? null;

export function toOrderView(order: OrderRow | OrderDetailRow, isAdmin: boolean): OrderView {
  const view: OrderView = {
    id: order.id,
    orderNo: order.orderNo,
    publicToken: order.publicToken,
    status: order.status,
    source: order.source,
    type: order.type,
    fulfillmentStatus: order.fulfillmentStatus,
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    table: order.table,
    deliveryDate: order.deliveryDate.toISOString().slice(0, 10),
    batchId: order.batchId,
    note: order.note,
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    hppTotal: isAdmin ? order.hppTotal : null,
    paymentMethod: order.paymentMethod,
    paidAmount: order.paidAmount,
    changeAmount: order.changeAmount,
    paymentRef: order.paymentRef,
    paymentProofUrl: order.paymentProofUrl,
    reason: order.reason,
    createdBy: order.createdBy,
    approvedBy: order.approvedBy,
    approvedAt: iso(order.approvedAt),
    preparingAt: iso(order.preparingAt),
    readyAt: iso(order.readyAt),
    handedOverAt: iso(order.handedOverAt),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    items: order.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      productId: i.variant.productId,
      productName: i.productName,
      categoryCode: i.categoryCode,
      packSize: i.packSize,
      price: i.price,
      qty: i.qty,
      subtotal: i.subtotal,
      hppPerPack: isAdmin ? i.hppPerPack : null,
      note: i.note,
    })),
  };
  if ('logs' in order) {
    view.logs = order.logs.map((l) => ({
      id: l.id,
      action: l.action,
      fromStatus: l.fromStatus,
      toStatus: l.toStatus,
      reason: l.reason,
      userName: l.user?.name ?? (l.userId ? null : 'Pelanggan'),
      createdAt: l.createdAt.toISOString(),
    }));
  }
  return view;
}

export function orderLabel(order: {
  orderNo: string;
  customerName: string | null;
  table: { name: string } | null;
}) {
  if (order.table)
    return `${order.table.name}${order.customerName ? ` · ${order.customerName}` : ''}`;
  return order.customerName ?? order.orderNo;
}

export function toOrderEvent(order: OrderRow): OrderEvent {
  return {
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    source: order.source,
    fulfillmentStatus: order.fulfillmentStatus,
    createdById: order.createdById,
    label: orderLabel(order),
  };
}
