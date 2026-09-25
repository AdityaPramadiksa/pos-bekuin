import type { OrderSource } from './enums';
import type { DashboardDay } from './finance';

export interface TodaySummary {
  date: string;
  pending: { total: number; bySource: Partial<Record<OrderSource, number>> };
  paid: { count: number; revenue: number; grossProfit: number };
  byPaymentMethod: { name: string; count: number; amount: number }[];
  lowStock: { products: number; ingredients: number };
  /** Pre-order untuk besok (kartu "Besok" di dashboard). */
  tomorrow: {
    date: string;
    orders: number;
    customers: number;
    packs: number;
    pcs: number;
    amount: number;
  };
  /** Omzet & laba kotor 7 hari terakhir (grafik dashboard), hari ini paling akhir. */
  last7Days: DashboardDay[];
  /** Shift kasir yang sedang terbuka. */
  cashSession: { id: string; openedAt: string; openingCash: number; expectedCash: number } | null;
}
