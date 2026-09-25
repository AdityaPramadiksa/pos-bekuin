import type { FulfillmentStatus, OrderSource, OrderStatus, OrderType, PaymentType } from './enums';

export interface OrderItemView {
  id: string;
  variantId: string;
  productId: string;
  productName: string;
  categoryCode: string;
  packSize: number;
  price: number;
  qty: number;
  subtotal: number;
  /** Hanya untuk admin (null untuk staff). */
  hppPerPack: number | null;
  note: string | null;
}

export interface OrderLogView {
  id: string;
  action: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus | null;
  reason: string | null;
  userName: string | null;
  createdAt: string;
}

export interface OrderView {
  id: string;
  orderNo: string;
  publicToken: string;
  status: OrderStatus;
  source: OrderSource;
  type: OrderType;
  fulfillmentStatus: FulfillmentStatus;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  table: { id: string; code: string; name: string } | null;
  /** YYYY-MM-DD */
  deliveryDate: string;
  batchId: string | null;
  note: string | null;
  subtotal: number;
  discount: number;
  total: number;
  /** Hanya untuk admin (null untuk staff). */
  hppTotal: number | null;
  paymentMethod: { id: string; name: string; type: PaymentType } | null;
  paidAmount: number | null;
  changeAmount: number | null;
  paymentRef: string | null;
  paymentProofUrl: string | null;
  payAtCashier: boolean;
  /** Kode unik QRIS (order pelanggan); nominal masuk = total + kode unik. */
  uniqueCode: number | null;
  reason: string | null;
  createdBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  handedOverAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemView[];
  logs?: OrderLogView[];
}

export interface OrderListResponse {
  items: OrderView[];
  total: number;
}

export interface StockShortage {
  name: string;
  unit: string;
  need: number;
  available: number;
}

/** Payload event Socket.IO (ringan; klien memuat ulang data lewat REST). */
export interface OrderEvent {
  id: string;
  orderNo: string;
  status: OrderStatus;
  source: OrderSource;
  fulfillmentStatus: FulfillmentStatus;
  createdById: string | null;
  label: string;
}

export const SOURCE_LABEL: Record<OrderSource, string> = {
  POS: 'POS',
  ADMIN: 'Admin',
  QR_TABLE: 'QR Meja',
  WA_IMPORT: 'WhatsApp',
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: 'Makan di sini',
  TAKEAWAY: 'Bawa pulang',
  PREORDER: 'Pre-order',
};

export const STOCK_UNIT_LABEL: Record<'GRAM' | 'ML' | 'PCS', string> = {
  GRAM: 'g',
  ML: 'ml',
  PCS: 'pcs',
};

export const FULFILLMENT_FLOW = ['QUEUED', 'PREPARING', 'READY', 'HANDED_OVER'] as const;

/** Langkah berikutnya di antrian dapur (null = sudah selesai). */
export function nextFulfillment(status: (typeof FULFILLMENT_FLOW)[number]) {
  const i = FULFILLMENT_FLOW.indexOf(status);
  return i >= 0 && i < FULFILLMENT_FLOW.length - 1 ? FULFILLMENT_FLOW[i + 1] : null;
}
