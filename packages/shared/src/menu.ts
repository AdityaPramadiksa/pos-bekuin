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
  /** Kemasan per pack (plastik vacuum, box, saos, ...). */
  packaging: { ingredientId: string; name: string; qty: number; unitCost: number }[];
  /** HPP teoretis per pack (null bila produk belum punya resep). */
  hppPerPack: number | null;
  margin: number | null;
  marginPct: number | null;
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
  /** HPP teoretis per pcs dari resep (dibulatkan Rp10); null bila belum ada resep. */
  costPerPcs: number | null;
  recipeId: string | null;
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

export interface SettingsView {
  storeName: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  receiptFooter: string | null;
  qrisImageUrl: string | null;
  /** Teks QRIS statis (untuk QR bernominal per order); null = belum diatur. */
  qrisPayload: string | null;
  logoUrl: string | null;
  isStoreOpen: boolean;
  openingHours: OpeningHours | null;
  qrOrderingEnabled: boolean;
  qrMaxOrderTotal: number;
  /** Token link order online (/pesan/<token>). */
  onlineOrderToken: string | null;
  onlineOrderingEnabled: boolean;
  deliveryEnabled: boolean;
  deliveryFee: number;
  freeDeliveryMin: number;
  deliveryNote: string | null;
  blockApproveOnLowStock: boolean;
  paperWidthChars: number;
}

export const UPLOAD_PURPOSES = ['menu', 'logo', 'qris', 'proof', 'receipt'] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export interface TableView {
  id: string;
  code: string;
  name: string;
  /** Hanya untuk admin; null untuk staff. */
  qrToken: string | null;
  isActive: boolean;
  sortOrder: number;
}
