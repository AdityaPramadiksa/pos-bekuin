import type { PaymentType, Role } from './enums';

/** Jam buka per hari (WITA). null = tutup hari itu. Objek kosong/null = selalu buka. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type OpeningHours = Partial<Record<Weekday, [string, string] | null>>;

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Senin',
  tue: 'Selasa',
  wed: 'Rabu',
  thu: 'Kamis',
  fri: 'Jumat',
  sat: 'Sabtu',
  sun: 'Minggu',
};

export interface SalesCategoryView {
  id: string;
  code: string;
  name: string;
  isCustomerVisible: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface VariantView {
  id: string;
  productId: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  packSize: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
  usedInOrders: boolean;
}

export interface ProductView {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  stockPcs: number;
  minStockPcs: number;
  isActive: boolean;
  isAvailable: boolean;
  sortOrder: number;
  variants: VariantView[];
}

/** Katalog untuk layar POS (hanya yang aktif). */
export interface CatalogVariant {
  id: string;
  categoryId: string;
  categoryCode: string;
  packSize: number;
  price: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  stockPcs: number;
  /** stok − pcs di order PENDING yang dikirim hari ini atau sebelumnya */
  availablePcs: number;
  variants: CatalogVariant[];
}

export interface CatalogResponse {
  categories: Pick<SalesCategoryView, 'id' | 'code' | 'name'>[];
  products: CatalogProduct[];
}

export interface PaymentMethodView {
  id: string;
  name: string;
  type: PaymentType;
  accountInfo: string | null;
  isActive: boolean;
  showToCustomer: boolean;
  sortOrder: number;
}

export interface UserView {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export type QrPaymentMode = 'QRIS_ONLY' | 'QRIS_OR_CASHIER';

export interface SettingsView {
  storeName: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  receiptFooter: string | null;
  qrisImageUrl: string | null;
  logoUrl: string | null;
  isStoreOpen: boolean;
  openingHours: OpeningHours | null;
  qrOrderingEnabled: boolean;
  qrPaymentMode: QrPaymentMode;
  qrMaxOrderTotal: number;
  blockApproveOnLowStock: boolean;
  paperWidthChars: number;
}

export const UPLOAD_PURPOSES = ['menu', 'logo', 'qris', 'proof', 'receipt'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
