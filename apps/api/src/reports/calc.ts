/**
 * Perhitungan laporan (fungsi murni, tanpa DB) supaya aturan uang mudah diuji:
 * - Omzet hanya dari order PAID; VOIDED/REJECTED/CANCELLED dihitung terpisah.
 * - Laba kotor = omzet bersih − HPP snapshot; laba bersih = laba kotor − pengeluaran − waste.
 */
import {
  businessDateKey,
  type AmountRow,
  type ExcludedOrders,
  type OrderSource,
  type OrderStatus,
  type PaymentType,
  type ProductProfitRow,
  type ProfitLossLine,
  type SalesTotals,
} from '@bekuin/shared';

export interface CalcItem {
  productId: string;
  productName: string;
  categoryCode: string;
  packSize: number;
  qty: number;
  subtotal: number;
  hppPerPack: number;
}

export interface CalcOrder {
  id: string;
  status: OrderStatus;
  source: OrderSource;
  subtotal: number;
  discount: number;
  total: number;
  hppTotal: number;
  approvedAt: Date | null;
  /** null pada order disetujui = belum dibayar (COD). */
  paidAt: Date | null;
  createdAt: Date;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  paymentType: PaymentType | null;
  staffName: string | null;
  items: CalcItem[];
}

export const CATEGORY_LABEL: Record<string, string> = {
  FROZEN: 'Frozen',
  SIAP_MAKAN: 'Siap Makan',
};

/** Tanggal bisnis order: tanggal approve (lunas) WITA, atau tanggal dibuat bila belum pernah lunas. */
export const orderDateKey = (o: Pick<CalcOrder, 'approvedAt' | 'createdAt'>) =>
  businessDateKey(o.approvedAt ?? o.createdAt);

/** Jam WITA (UTC+8, tanpa DST). */
export const witaHour = (d: Date) => (d.getUTCHours() + 8) % 24;

/** Persen 1 desimal; 0 bila pembagi 0. */
export const pct = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part * 1000) / whole) / 10;

export const isRevenue = (o: Pick<CalcOrder, 'status'>) => o.status === 'PAID';

export function summarizeSales(orders: CalcOrder[]): {
  summary: SalesTotals;
  excluded: ExcludedOrders;
} {
  const paid = orders.filter(isRevenue);
  const sum = (list: CalcOrder[], pick: (o: CalcOrder) => number) =>
    list.reduce((s, o) => s + pick(o), 0);
  const netSales = sum(paid, (o) => o.total);
  const hpp = sum(paid, (o) => o.hppTotal);
  const bucket = (status: OrderStatus) => {
    const list = orders.filter((o) => o.status === status);
    return { count: list.length, amount: sum(list, (o) => o.total) };
  };
  return {
    summary: {
      orders: paid.length,
      grossSales: sum(paid, (o) => o.subtotal),
      discount: sum(paid, (o) => o.discount),
      netSales,
      avgOrder: paid.length ? Math.round(netSales / paid.length) : 0,
      hpp,
      grossProfit: netSales - hpp,
    },
    excluded: {
      voided: bucket('VOIDED'),
      rejected: bucket('REJECTED'),
      cancelled: bucket('CANCELLED'),
    },
  };
}

/** Kelompokkan order lunas → baris jumlah & nominal, urut nominal terbesar. */
export function groupOrders(
  orders: CalcOrder[],
  key: (o: CalcOrder) => string,
  label: (o: CalcOrder) => string,
): AmountRow[] {
  const map = new Map<string, AmountRow>();
  for (const o of orders.filter(isRevenue)) {
    const k = key(o);
    const row = map.get(k) ?? { key: k, label: label(o), count: 0, amount: 0 };
    row.count += 1;
    row.amount += o.total;
    map.set(k, row);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/** Semua tanggal dari `from` sampai `to` (inklusif). */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

export function salesByDay(orders: CalcOrder[], from: string, to: string) {
  const map = new Map(
    eachDay(from, to).map((date) => [date, { date, orders: 0, netSales: 0, grossProfit: 0 }]),
  );
  for (const o of orders.filter(isRevenue)) {
    const row = map.get(orderDateKey(o));
    if (!row) continue;
    row.orders += 1;
    row.netSales += o.total;
    row.grossProfit += o.total - o.hppTotal;
  }
  return [...map.values()];
}

export function salesByHour(orders: CalcOrder[]) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, amount: 0 }));
  for (const o of orders.filter(isRevenue)) {
    const h = hours[witaHour(o.approvedAt ?? o.createdAt)];
    h.count += 1;
    h.amount += o.total;
  }
  return hours;
}

/**
 * Bagi diskon order ke item secara proporsional (metode sisa terbesar),
 * sehingga jumlahnya selalu tepat sama dengan diskon.
 */
export function allocateDiscount(subtotals: number[], discount: number): number[] {
  const base = subtotals.reduce((s, n) => s + n, 0);
  if (discount <= 0 || base <= 0) return subtotals.map(() => 0);
  const exact = subtotals.map((n) => (n * discount) / base);
  const shares = exact.map(Math.floor);
  let rest = discount - shares.reduce((s, n) => s + n, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    shares[i] += 1;
    rest -= 1;
  }
  return shares;
}

/** Laba per varian, per produk, dan per kategori dari item order lunas (setelah diskon). */
export function productProfit(orders: CalcOrder[]) {
  const variants = new Map<string, ProductProfitRow>();
  const products = new Map<string, ProductProfitRow>();
  const categories = new Map<string, ProductProfitRow>();
  const add = (
    map: Map<string, ProductProfitRow>,
    key: string,
    base: Omit<ProductProfitRow, 'packs' | 'pcs' | 'revenue' | 'hpp' | 'profit' | 'marginPct'>,
    packs: number,
    pcs: number,
    revenue: number,
    hpp: number,
  ) => {
    const row = map.get(key) ?? {
      ...base,
      packs: 0,
      pcs: 0,
      revenue: 0,
      hpp: 0,
      profit: 0,
      marginPct: 0,
    };
    row.packs += packs;
    row.pcs += pcs;
    row.revenue += revenue;
    row.hpp += hpp;
    map.set(key, row);
  };
  for (const o of orders.filter(isRevenue)) {
    const shares = allocateDiscount(
      o.items.map((i) => i.subtotal),
      o.discount,
    );
    o.items.forEach((item, idx) => {
      const revenue = item.subtotal - shares[idx];
      const hpp = item.qty * item.hppPerPack;
      const pcs = item.qty * item.packSize;
      const category = CATEGORY_LABEL[item.categoryCode] ?? item.categoryCode;
      add(
        variants,
        `${item.productId}:${item.categoryCode}:${item.packSize}`,
        {
          key: `${item.productId}:${item.categoryCode}:${item.packSize}`,
          productId: item.productId,
          productName: `${item.productName} ${category} isi ${item.packSize}`,
          categoryCode: item.categoryCode,
          packSize: item.packSize,
        },
        item.qty,
        pcs,
        revenue,
        hpp,
      );
      add(
        products,
        item.productId,
        {
          key: item.productId,
          productId: item.productId,
          productName: item.productName,
          categoryCode: '',
          packSize: null,
        },
        item.qty,
        pcs,
        revenue,
        hpp,
      );
      add(
        categories,
        item.categoryCode,
        {
          key: item.categoryCode,
          productId: '',
          productName: category,
          categoryCode: item.categoryCode,
          packSize: null,
        },
        item.qty,
        pcs,
        revenue,
        hpp,
      );
    });
  }
  const finish = (map: Map<string, ProductProfitRow>) =>
    [...map.values()]
      .map((r) => ({
        ...r,
        profit: r.revenue - r.hpp,
        marginPct: pct(r.revenue - r.hpp, r.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  return {
    byVariant: finish(variants),
    byProduct: finish(products),
    byCategory: finish(categories),
  };
}

export function profitLossLine(
  period: string,
  parts: { netSales: number; hpp: number; expenses: number; waste: number },
): ProfitLossLine {
  const grossProfit = parts.netSales - parts.hpp;
  return {
    period,
    ...parts,
    grossProfit,
    netProfit: grossProfit - parts.expenses - parts.waste,
  };
}

/** Kas yang seharusnya ada di laci saat tutup shift. */
export const expectedCash = (openingCash: number, cashSales: number, cashExpenses: number) =>
  openingCash + cashSales - cashExpenses;

/** Rata-rata selisih menit antar dua waktu; null bila tidak ada pasangan lengkap. */
export function avgMinutes(pairs: [Date | null, Date | null][]): number | null {
  const diffs = pairs
    .filter((p): p is [Date, Date] => !!p[0] && !!p[1])
    .map(([a, b]) => (b.getTime() - a.getTime()) / 60_000);
  if (!diffs.length) return null;
  return Math.round((diffs.reduce((s, n) => s + n, 0) / diffs.length) * 10) / 10;
}
