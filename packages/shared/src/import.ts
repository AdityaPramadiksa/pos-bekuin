export type ParseStatus = 'OK' | 'WARN' | 'ERROR';

export interface ParsedLine {
  lineNo: number;
  raw: string;
  /** Teks nama produk seperti ditulis pelanggan (untuk "Ingat sebagai alias"). */
  productText: string;
  productId: string | null;
  productName: string | null;
  categoryCode: string;
  packSize: number | null;
  qty: number;
  variantId: string | null;
  price: number | null;
  subtotal: number;
  status: ParseStatus;
  messages: string[];
}

export interface ParsedCustomer {
  key: string;
  name: string;
  nameNormalized: string;
  merged: boolean;
  isNew: boolean;
  customerId: string | null;
  lines: ParsedLine[];
  total: number;
}

export interface ParsedBatch {
  deliveryDate: string;
  headerDetected: boolean;
  customers: ParsedCustomer[];
  ignoredLines: { lineNo: number; raw: string }[];
  totals: { orders: number; packs: number; amount: number };
  hasErrors: boolean;
}

export interface ImportCatalogProduct {
  id: string;
  name: string;
  variants: { id: string; categoryCode: string; packSize: number; price: number }[];
}

export interface ImportCatalog {
  products: ImportCatalogProduct[];
  aliases: { alias: string; productId: string }[];
}

export interface ImportResult {
  batchId: string;
  orders: number;
  packs: number;
  amount: number;
}

export interface CustomerView {
  id: string;
  name: string;
  phone: string | null;
  note: string | null;
  isActive: boolean;
  orderCount: number;
  lastOrderAt: string | null;
  totalSpent: number;
}

export interface ProductAliasView {
  id: string;
  alias: string;
  productId: string;
  productName: string;
}
