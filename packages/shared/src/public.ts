import type { FulfillmentStatus, OrderStatus, OrderType } from './enums';
import type { OpeningHours, QrPaymentMode } from './menu';

/** Menu untuk halaman pelanggan QR (tanpa stok angka persis, tanpa HPP). */
export interface PublicMenuResponse {
  store: {
    name: string;
    tagline: string | null;
    logoUrl: string | null;
    isOpen: boolean;
    closedReason: string | null;
    openingHours: OpeningHours | null;
  };
  table: { code: string; name: string; isTakeaway: boolean };
  qrPaymentMode: QrPaymentMode;
  maxOrderTotal: number;
  categories: { id: string; code: string; name: string }[];
  products: {
    id: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    variants: {
      id: string;
      categoryId: string;
      categoryCode: string;
      packSize: number;
      price: number;
      available: boolean;
    }[];
  }[];
}

export interface PublicOrderCreated {
  orderNo: string;
  publicToken: string;
  total: number;
}

export interface PublicOrderView {
  orderNo: string;
  publicToken: string;
  status: OrderStatus;
  fulfillmentStatus: FulfillmentStatus;
  type: OrderType;
  customerName: string | null;
  tableName: string | null;
  items: {
    productName: string;
    categoryCode: string;
    packSize: number;
    price: number;
    qty: number;
    subtotal: number;
  }[];
  subtotal: number;
  discount: number;
  total: number;
  payAtCashier: boolean;
  paymentMethodName: string | null;
  hasPaymentProof: boolean;
  reason: string | null;
  createdAt: string;
  approvedAt: string | null;
  readyAt: string | null;
  handedOverAt: string | null;
  store: { name: string; qrisImageUrl: string | null; phone: string | null };
  canCancel: boolean;
  canUploadProof: boolean;
}
