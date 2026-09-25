import type { OrderSource } from './enums';

export interface TodaySummary {
  date: string;
  pending: { total: number; bySource: Partial<Record<OrderSource, number>> };
  paid: { count: number; revenue: number; grossProfit: number };
  byPaymentMethod: { name: string; count: number; amount: number }[];
  lowStock: { products: number; ingredients: number };
}
