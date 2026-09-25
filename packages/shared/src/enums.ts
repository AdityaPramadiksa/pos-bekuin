// Enum harus sama persis dengan enum di apps/api/prisma/schema.prisma.

export const Role = { ADMIN: 'ADMIN', STAFF: 'STAFF' } as const;
export type Role = (typeof Role)[keyof typeof Role];

export const OrderStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  VOIDED: 'VOIDED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Dari mana order masuk. */
export const OrderSource = {
  POS: 'POS', // diinput staff di layar POS
  ADMIN: 'ADMIN', // admin jualan langsung
  QR_TABLE: 'QR_TABLE', // pelanggan scan QR di meja
  WA_IMPORT: 'WA_IMPORT', // tempel pesan WhatsApp
  ONLINE: 'ONLINE', // pelanggan pesan sendiri lewat link order online
} as const;
export type OrderSource = (typeof OrderSource)[keyof typeof OrderSource];

/** Pesanan online: ambil sendiri atau diantar. */
export const DeliveryMethod = { PICKUP: 'PICKUP', DELIVERY: 'DELIVERY' } as const;
export type DeliveryMethod = (typeof DeliveryMethod)[keyof typeof DeliveryMethod];

export const DELIVERY_METHOD_LABEL: Record<DeliveryMethod, string> = {
  PICKUP: 'Ambil sendiri',
  DELIVERY: 'Diantar',
};

export const OrderType = {
  DINE_IN: 'DINE_IN',
  TAKEAWAY: 'TAKEAWAY',
  PREORDER: 'PREORDER',
} as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];

/** Status penyiapan (dapur/packing), terpisah dari status bayar. */
export const FulfillmentStatus = {
  PROCESSING: 'PROCESSING',
  DONE: 'DONE',
} as const;
export type FulfillmentStatus = (typeof FulfillmentStatus)[keyof typeof FulfillmentStatus];

export const PaymentType = {
  CASH: 'CASH',
  TRANSFER: 'TRANSFER',
  QRIS: 'QRIS',
  EWALLET: 'EWALLET',
} as const;
export type PaymentType = (typeof PaymentType)[keyof typeof PaymentType];

export const SalesCategoryCode = { FROZEN: 'FROZEN', SIAP_MAKAN: 'SIAP_MAKAN' } as const;
export type SalesCategoryCode = (typeof SalesCategoryCode)[keyof typeof SalesCategoryCode];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Menunggu approval',
  PAID: 'Disetujui',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
  VOIDED: 'Void',
};

export const FULFILLMENT_STATUS_LABEL: Record<FulfillmentStatus, string> = {
  PROCESSING: 'Diproses',
  DONE: 'Selesai',
};
