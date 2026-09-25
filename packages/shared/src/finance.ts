import type { MovementType } from './stock';

// ───────────────────────── Pengeluaran & shift kasir ─────────────────────────

export interface ExpenseCategoryView {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface ExpenseView {
  id: string;
  date: string;
  categoryId: string;
  categoryName: string;
  amount: number;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  /** Dibayar dari uang laci (metode bertipe CASH). */
  fromCashDrawer: boolean;
  note: string | null;
  photoUrl: string | null;
  cashSessionId: string | null;
  /** Shift-nya sudah ditutup → tidak bisa diubah/dihapus. */
  locked: boolean;
  createdByName: string;
  createdAt: string;
}

export interface AmountRow {
  key: string;
  label: string;
  count: number;
  amount: number;
}

export interface CashSessionSummary {
  orders: number;
  sales: number;
  cashSales: number;
  cashExpenses: number;
  byMethod: AmountRow[];
  byCategory: (AmountRow & { packs: number })[];
  voided: { count: number; amount: number };
  expenses: { count: number; amount: number };
  expectedCash: number;
}

export interface CashSessionView {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  openedByName: string;
  openingCash: number;
  closedAt: string | null;
  closedByName: string | null;
  expectedCash: number | null;
  countedCash: number | null;
  difference: number | null;
  note: string | null;
  summary: CashSessionSummary;
}

// ───────────────────────────────── Laporan ─────────────────────────────────

export const REPORT_TYPES = [
  'sales',
  'profit-loss',
  'product-profit',
  'cashflow',
  'top-products',
  'stock-movements',
  'shifts',
  'qr-service',
  'daily-closing',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_LABEL: Record<ReportType, string> = {
  sales: 'Penjualan',
  'profit-loss': 'Laba Rugi',
  'product-profit': 'Laba per Produk',
  cashflow: 'Arus Kas',
  'top-products': 'Produk Terlaris',
  'stock-movements': 'Mutasi Stok',
  shifts: 'Shift Kasir',
  'qr-service': 'Layanan QR',
  'daily-closing': 'Rekap Harian',
};

export interface ReportRange {
  from: string;
  to: string;
}

export interface SalesTotals {
  orders: number;
  grossSales: number;
  discount: number;
  netSales: number;
  avgOrder: number;
  hpp: number;
  grossProfit: number;
}

export interface ExcludedOrders {
  voided: { count: number; amount: number };
  rejected: { count: number; amount: number };
  cancelled: { count: number; amount: number };
}

export interface SalesReport {
  range: ReportRange;
  summary: SalesTotals;
  excluded: ExcludedOrders;
  byMethod: AmountRow[];
  bySource: AmountRow[];
  byStaff: AmountRow[];
  byHour: { hour: number; count: number; amount: number }[];
  byDay: { date: string; orders: number; netSales: number; grossProfit: number }[];
}

export interface ProfitLossLine {
  period: string;
  netSales: number;
  hpp: number;
  grossProfit: number;
  expenses: number;
  waste: number;
  netProfit: number;
}

export interface ProfitLossReport {
  range: ReportRange;
  total: ProfitLossLine & { grossMarginPct: number; netMarginPct: number };
  expensesByCategory: AmountRow[];
  byMonth: ProfitLossLine[];
}

export interface ProductProfitRow {
  key: string;
  productId: string;
  productName: string;
  categoryCode: string;
  packSize: number | null;
  packs: number;
  pcs: number;
  revenue: number;
  hpp: number;
  profit: number;
  marginPct: number;
}

export interface ProductProfitReport {
  range: ReportRange;
  byVariant: ProductProfitRow[];
  byProduct: ProductProfitRow[];
  byCategory: ProductProfitRow[];
}

export interface CashflowReport {
  range: ReportRange;
  /** Hanya uang yang sudah diterima; order disetujui yang belum dibayar (COD) terpisah di `unpaid`. */
  inflow: { byMethod: AmountRow[]; total: number; unpaid: { count: number; amount: number } };
  outflow: { purchases: number; expenses: AmountRow[]; total: number };
  net: number;
  byDay: { date: string; inflow: number; outflow: number; net: number }[];
  cashDrawer: {
    sessions: number;
    openingCash: number;
    cashSales: number;
    cashExpenses: number;
    difference: number;
  };
}

export interface StockMovementReportRow {
  itemType: 'PRODUCT' | 'INGREDIENT';
  itemId: string;
  itemName: string;
  unit: string;
  type: MovementType;
  count: number;
  qty: number;
  value: number;
}

export interface StockMovementReport {
  range: ReportRange;
  rows: StockMovementReportRow[];
  byType: { type: MovementType; count: number; value: number }[];
}

export interface QrServiceReport {
  range: ReportRange;
  orders: number;
  paid: number;
  rejected: number;
  cancelled: number;
  revenue: number;
  /** Rata-rata menit per tahap (null bila belum ada data). */
  avgMinutes: {
    /** Pesan → disetujui. */
    orderToPaid: number | null;
    /** Disetujui → ditandai selesai/siap. */
    paidToDone: number | null;
    total: number | null;
  };
  byDay: { date: string; orders: number; revenue: number }[];
}

export interface DailyClosingReport {
  date: string;
  summary: SalesTotals;
  excluded: ExcludedOrders;
  byMethod: AmountRow[];
  byCategory: (AmountRow & { packs: number })[];
  expenses: { total: number; byCategory: AmountRow[] };
  purchases: number;
  waste: number;
  netProfit: number;
  pending: number;
  shifts: CashSessionView[];
}

export interface DashboardDay {
  date: string;
  orders: number;
  revenue: number;
  grossProfit: number;
}

export interface TopProductsReport {
  range: ReportRange;
  rows: ProductProfitRow[];
}
