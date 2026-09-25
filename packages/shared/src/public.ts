import type { FulfillmentStatus, OrderStatus, OrderType, PaymentType } from './enums';
import type { OpeningHours } from './menu';

/** Metode bayar yang boleh dipilih pelanggan saat pesan (diatur di Metode Bayar). */
export interface PublicPaymentMethod {
  id: string;
  name: string;
  type: PaymentType;
}

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
  paymentMethods: PublicPaymentMethod[];
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
  /** Cara bayar pilihan pelanggan & apa yang harus dibayar. */
  payment: {
    methodName: string | null;
    type: PaymentType | null;
    /** Nominal yang harus dibayar = total + kode unik (QRIS). */
    amount: number;
    uniqueCode: number | null;
    /** QRIS bernominal siap ditampilkan sebagai QR; null bila toko belum mengatur teks QRIS. */
    qrisPayload: string | null;
    /** Info rekening untuk Transfer. */
    accountInfo: string | null;
  };
  canCancel: boolean;
  canUploadProof: boolean;
}
