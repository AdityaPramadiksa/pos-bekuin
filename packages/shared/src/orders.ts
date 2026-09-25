import type {
  DeliveryMethod,
  FulfillmentStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentType,
} from './enums';

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
  /** Pesanan online: cara terima, alamat antar, dan ongkir (sudah termasuk di total). */
  deliveryMethod: DeliveryMethod | null;
  deliveryAddress: string | null;
  deliveryFee: number;
  reason: string | null;
  createdBy: { id: string; name: string } | null;
  approvedBy: { id: string; name: string } | null;
  approvedAt: string | null;
  /** Waktu uang diterima; null pada order disetujui = belum dibayar (COD / bayar saat ambil). */
  paidAt: string | null;
  /** Waktu ditandai Selesai / Dikirim / Siap diambil. */
  completedAt: string | null;
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
  ONLINE: 'Online',
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

/** Halaman Diproses: order yang harus disiapkan + yang sudah selesai hari ini. */
export interface ProcessingView {
  processing: OrderView[];
  done: OrderView[];
}
