import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SOURCE_LABEL,
  type AmountRow,
  type CashflowReport,
  type DailyClosingReport,
  type MovementType,
  type ProductProfitReport,
  type ProfitLossReport,
  type QrServiceReport,
  type ReportRange,
  type SalesReport,
  type StockMovementReport,
  type TodaySummary,
  type TopProductsReport,
} from '@bekuin/shared';
import { CashSessionsService } from '../cash-sessions/cash-sessions.service';
import { addDays, assertDateKey, businessRange, dateOnly, todayKey } from '../common/dates';
import { CostingService } from '../costing/costing.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  avgMinutes,
  eachDay,
  groupOrders,
  isRevenue,
  orderDateKey,
  pct,
  productProfit,
  profitLossLine,
  salesByDay,
  salesByHour,
  summarizeSales,
  type CalcOrder,
} from './calc';

/** Batas rentang laporan agar query tetap ringan. */
const MAX_RANGE_DAYS = 400;

const orderSelect = {
  id: true,
  status: true,
  source: true,
  subtotal: true,
  discount: true,
  total: true,
  hppTotal: true,
  approvedAt: true,
  paidAt: true,
  createdAt: true,
  paymentMethodId: true,
  paymentMethod: { select: { name: true, type: true } },
  createdBy: { select: { name: true } },
  items: {
    select: {
      productName: true,
      categoryCode: true,
      packSize: true,
      qty: true,
      subtotal: true,
      hppPerPack: true,
      variant: { select: { productId: true } },
    },
  },
} satisfies Prisma.OrderSelect;

const sumBy = <T>(list: T[], pick: (x: T) => number) => list.reduce((s, x) => s + pick(x), 0);

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
    private readonly cash: CashSessionsService,
  ) {}

  /** Validasi & default periode laporan (hari ini). */
  range(from?: string, to?: string): ReportRange {
    const start = assertDateKey(from || todayKey(), 'from');
    const end = assertDateKey(to || start, 'to');
    if (end < start)
      throw new BadRequestException('Tanggal akhir tidak boleh sebelum tanggal awal');
    if (eachDay(start, end).length > MAX_RANGE_DAYS) {
      throw new BadRequestException(`Rentang laporan maksimal ${MAX_RANGE_DAYS} hari`);
    }
    return { from: start, to: end };
  }

  // ─────────────────────────────── Dashboard ───────────────────────────────

  async today(): Promise<TodaySummary> {
    const date = todayKey();
    const range = businessRange(date);
    const weekStart = addDays(date, -6);
    const [pending, paid, byMethod, methods, lowProducts, lowIngredients, week, session] =
      await Promise.all([
        this.prisma.order.groupBy({ by: ['source'], where: { status: 'PENDING' }, _count: true }),
        this.prisma.order.aggregate({
          where: { status: 'PAID', approvedAt: range },
          _count: true,
          _sum: { total: true, hppTotal: true },
        }),
        this.prisma.order.groupBy({
          by: ['paymentMethodId'],
          where: { status: 'PAID', approvedAt: range },
          _count: true,
          _sum: { total: true },
        }),
        this.prisma.paymentMethod.findMany({ select: { id: true, name: true } }),
        this.prisma.$queryRaw<[{ n: number }]>`
          SELECT COUNT(*)::int AS n FROM products WHERE "isActive" AND "stockPcs" <= "minStockPcs"`,
        this.prisma.$queryRaw<[{ n: number }]>`
          SELECT COUNT(*)::int AS n FROM ingredients WHERE "isActive" AND "stockQty" <= "minStock" AND "minStock" > 0`,
        this.loadOrders(weekStart, date, { status: 'PAID' }),
        this.cash.current(),
      ]);
    const tomorrowKey = addDays(date, 1);
    const tomorrowOrders = await this.prisma.order.findMany({
      where: { status: { in: ['PENDING', 'PAID'] }, deliveryDate: dateOnly(tomorrowKey) },
      select: {
        customerId: true,
        customerName: true,
        total: true,
        items: { select: { qty: true, packSize: true } },
      },
    });
    const tomorrowItems = tomorrowOrders.flatMap((o) => o.items);
    const methodName = new Map(methods.map((m) => [m.id, m.name]));
    const revenue = paid._sum.total ?? 0;
    return {
      date,
      pending: {
        total: pending.reduce((sum, p) => sum + p._count, 0),
        bySource: Object.fromEntries(pending.map((p) => [p.source, p._count])),
      },
      paid: { count: paid._count, revenue, grossProfit: revenue - (paid._sum.hppTotal ?? 0) },
      byPaymentMethod: byMethod
        .map((m) => ({
          name: methodName.get(m.paymentMethodId ?? '') ?? '-',
          count: m._count,
          amount: m._sum.total ?? 0,
        }))
        .sort((a, b) => b.amount - a.amount),
      lowStock: { products: lowProducts[0].n, ingredients: lowIngredients[0].n },
      tomorrow: {
        date: tomorrowKey,
        orders: tomorrowOrders.length,
        customers: new Set(
          tomorrowOrders.map((o) => o.customerId ?? o.customerName ?? Math.random()),
        ).size,
        packs: tomorrowItems.reduce((sum, i) => sum + i.qty, 0),
        pcs: tomorrowItems.reduce((sum, i) => sum + i.qty * i.packSize, 0),
        amount: tomorrowOrders.reduce((sum, o) => sum + o.total, 0),
      },
      last7Days: salesByDay(week, weekStart, date).map((d) => ({
        date: d.date,
        orders: d.orders,
        revenue: d.netSales,
        grossProfit: d.grossProfit,
      })),
      cashSession: session
        ? {
            id: session.id,
            openedAt: session.openedAt,
            openingCash: session.openingCash,
            expectedCash: session.summary.expectedCash,
          }
        : null,
    };
  }

  // ─────────────────────────────── Laporan ───────────────────────────────

  async sales(from?: string, to?: string): Promise<SalesReport> {
    const range = this.range(from, to);
    const orders = await this.loadOrders(range.from, range.to);
    const { summary, excluded } = summarizeSales(orders);
    return {
      range,
      summary,
      excluded,
      byMethod: groupOrders(
        orders,
        (o) => o.paymentMethodId ?? '-',
        (o) => o.paymentMethodName ?? '-',
      ),
      bySource: groupOrders(
        orders,
        (o) => o.source,
        (o) => SOURCE_LABEL[o.source],
      ),
      byStaff: groupOrders(
        orders,
        (o) => o.staffName ?? '-',
        (o) => o.staffName ?? 'Pelanggan (QR)',
      ),
      byHour: salesByHour(orders),
      byDay: salesByDay(orders, range.from, range.to),
    };
  }

  async profitLoss(from?: string, to?: string): Promise<ProfitLossReport> {
    const range = this.range(from, to);
    const [orders, expenses, waste] = await Promise.all([
      this.loadOrders(range.from, range.to, { status: 'PAID' }),
      this.loadExpenses(range.from, range.to),
      this.wasteByDay(range.from, range.to),
    ]);
    const months = [...new Set(eachDay(range.from, range.to).map((d) => d.slice(0, 7)))];
    const byMonth = months.map((month) => {
      const inMonth = orders.filter((o) => orderDateKey(o).startsWith(month));
      return profitLossLine(month, {
        netSales: sumBy(inMonth, (o) => o.total),
        hpp: sumBy(inMonth, (o) => o.hppTotal),
        expenses: sumBy(
          expenses.filter((e) => e.date.startsWith(month)),
          (e) => e.amount,
        ),
        waste: sumBy(
          [...waste].filter(([d]) => d.startsWith(month)),
          ([, v]) => v,
        ),
      });
    });
    const total = profitLossLine(`${range.from} s/d ${range.to}`, {
      netSales: sumBy(byMonth, (m) => m.netSales),
      hpp: sumBy(byMonth, (m) => m.hpp),
      expenses: sumBy(byMonth, (m) => m.expenses),
      waste: sumBy(byMonth, (m) => m.waste),
    });
    return {
      range,
      total: {
        ...total,
        grossMarginPct: pct(total.grossProfit, total.netSales),
        netMarginPct: pct(total.netProfit, total.netSales),
      },
      expensesByCategory: this.groupExpenses(expenses),
      byMonth,
    };
  }

  async productProfit(from?: string, to?: string): Promise<ProductProfitReport> {
    const range = this.range(from, to);
    const orders = await this.loadOrders(range.from, range.to, { status: 'PAID' });
    return { range, ...productProfit(orders) };
  }

  async topProducts(from?: string, to?: string): Promise<TopProductsReport> {
    const range = this.range(from, to);
    const orders = await this.loadOrders(range.from, range.to, { status: 'PAID' });
    return { range, rows: productProfit(orders).byProduct };
  }

  async cashflow(from?: string, to?: string): Promise<CashflowReport> {
    const range = this.range(from, to);
    const [orders, expenses, purchases, sessions] = await Promise.all([
      this.loadOrders(range.from, range.to, { status: 'PAID' }),
      this.loadExpenses(range.from, range.to),
      this.prisma.purchase.findMany({
        where: { date: { gte: dateOnly(range.from), lte: dateOnly(range.to) } },
        select: { date: true, total: true },
      }),
      this.cash.list(range.from, range.to),
    ]);
    // Arus kas hanya menghitung uang yang sudah diterima; COD yang belum dibayar dipisah.
    const received = orders.filter((o) => o.paidAt);
    const unpaid = orders.filter((o) => isRevenue(o) && !o.paidAt);
    const byMethod = groupOrders(
      received,
      (o) => o.paymentMethodId ?? '-',
      (o) => o.paymentMethodName ?? '-',
    );
    const inflowTotal = sumBy(byMethod, (m) => m.amount);
    const purchasesTotal = sumBy(purchases, (p) => p.total);
    const expenseRows = this.groupExpenses(expenses);
    const outflowTotal = purchasesTotal + sumBy(expenseRows, (e) => e.amount);
    const byDay = salesByDay(received, range.from, range.to).map((d) => {
      const outflow =
        sumBy(
          purchases.filter((p) => p.date.toISOString().startsWith(d.date)),
          (p) => p.total,
        ) +
        sumBy(
          expenses.filter((e) => e.date === d.date),
          (e) => e.amount,
        );
      return { date: d.date, inflow: d.netSales, outflow, net: d.netSales - outflow };
    });
    return {
      range,
      inflow: {
        byMethod,
        total: inflowTotal,
        unpaid: { count: unpaid.length, amount: sumBy(unpaid, (o) => o.total) },
      },
      outflow: { purchases: purchasesTotal, expenses: expenseRows, total: outflowTotal },
      net: inflowTotal - outflowTotal,
      byDay,
      cashDrawer: {
        sessions: sessions.length,
        openingCash: sumBy(sessions, (s) => s.openingCash),
        cashSales: sumBy(sessions, (s) => s.summary.cashSales),
        cashExpenses: sumBy(sessions, (s) => s.summary.cashExpenses),
        difference: sumBy(sessions, (s) => s.difference ?? 0),
      },
    };
  }

  async stockMovements(from?: string, to?: string): Promise<StockMovementReport> {
    const range = this.range(from, to);
    const r = businessRange(range.from, range.to);
    const rows = await this.prisma.$queryRaw<
      {
        itemType: 'PRODUCT' | 'INGREDIENT';
        itemId: string;
        type: MovementType;
        count: number;
        qty: number;
        value: number;
        zeroCostQty: number;
      }[]
    >`
      SELECT m."itemType", COALESCE(m."productId", m."ingredientId") AS "itemId", m.type,
             COUNT(*)::int AS count,
             SUM(m."qtyChange")::float8 AS qty,
             SUM(m."qtyChange" * m."unitCost")::float8 AS value,
             SUM(CASE WHEN m."unitCost" = 0 THEN m."qtyChange" ELSE 0 END)::float8 AS "zeroCostQty"
      FROM stock_movements m
      WHERE m."createdAt" >= ${r.gte} AND m."createdAt" < ${r.lt}
      GROUP BY 1, 2, 3`;
    const [products, ingredients, fallback] = await Promise.all([
      this.prisma.product.findMany({ select: { id: true, name: true } }),
      this.prisma.ingredient.findMany({ select: { id: true, name: true, baseUnit: true } }),
      this.productCostFallback(),
    ]);
    const productName = new Map(products.map((p) => [p.id, p.name]));
    const ingredient = new Map(ingredients.map((i) => [i.id, i]));
    const unitLabel = { GRAM: 'g', ML: 'ml', PCS: 'pcs' } as const;
    const result = rows
      .map((row) => {
        const isProduct = row.itemType === 'PRODUCT';
        const ing = ingredient.get(row.itemId);
        const extra = isProduct ? row.zeroCostQty * (fallback(row.itemId) ?? 0) : 0;
        return {
          itemType: row.itemType,
          itemId: row.itemId,
          itemName: (isProduct ? productName.get(row.itemId) : ing?.name) ?? '-',
          unit: isProduct ? 'pcs' : ing ? unitLabel[ing.baseUnit] : '',
          type: row.type,
          count: row.count,
          qty: Math.round(row.qty * 10_000) / 10_000,
          value: Math.round(row.value + extra),
        };
      })
      .sort((a, b) => a.itemName.localeCompare(b.itemName) || a.type.localeCompare(b.type));
    const byType = new Map<MovementType, { type: MovementType; count: number; value: number }>();
    for (const row of result) {
      const t = byType.get(row.type) ?? { type: row.type, count: 0, value: 0 };
      t.count += row.count;
      t.value += row.value;
      byType.set(row.type, t);
    }
    return { range, rows: result, byType: [...byType.values()] };
  }

  async shifts(from?: string, to?: string) {
    const range = this.range(from, to);
    return { range, sessions: await this.cash.list(range.from, range.to) };
  }

  async qrService(from?: string, to?: string): Promise<QrServiceReport> {
    const range = this.range(from, to);
    const orders = await this.prisma.order.findMany({
      where: { source: 'QR_TABLE', createdAt: businessRange(range.from, range.to) },
      select: {
        status: true,
        total: true,
        createdAt: true,
        approvedAt: true,
        completedAt: true,
      },
    });
    const paid = orders.filter((o) => o.status === 'PAID');
    const byDay = new Map(
      eachDay(range.from, range.to).map((d) => [d, { date: d, orders: 0, revenue: 0 }]),
    );
    for (const o of orders) {
      const row = byDay.get(orderDateKey({ approvedAt: null, createdAt: o.createdAt }));
      if (!row) continue;
      row.orders += 1;
      if (o.status === 'PAID') row.revenue += o.total;
    }
    return {
      range,
      orders: orders.length,
      paid: paid.length,
      rejected: orders.filter((o) => o.status === 'REJECTED').length,
      cancelled: orders.filter((o) => o.status === 'CANCELLED').length,
      revenue: sumBy(paid, (o) => o.total),
      avgMinutes: {
        orderToPaid: avgMinutes(paid.map((o) => [o.createdAt, o.approvedAt])),
        paidToDone: avgMinutes(paid.map((o) => [o.approvedAt, o.completedAt])),
        total: avgMinutes(paid.map((o) => [o.createdAt, o.completedAt])),
      },
      byDay: [...byDay.values()],
    };
  }

  /** Rekap tutup hari (bisa dicetak 58mm). */
  async dailyClosing(date?: string): Promise<DailyClosingReport> {
    const day = this.range(date, date).from;
    const [orders, expenses, purchases, waste, pending, shifts] = await Promise.all([
      this.loadOrders(day, day),
      this.loadExpenses(day, day),
      this.prisma.purchase.aggregate({ where: { date: dateOnly(day) }, _sum: { total: true } }),
      this.wasteByDay(day, day),
      this.prisma.order.count({ where: { status: 'PENDING' } }),
      this.cash.list(day, day),
    ]);
    const { summary, excluded } = summarizeSales(orders);
    const expenseRows = this.groupExpenses(expenses);
    const expenseTotal = sumBy(expenseRows, (e) => e.amount);
    const wasteTotal = sumBy([...waste.values()], (v) => v);
    return {
      date: day,
      summary,
      excluded,
      byMethod: groupOrders(
        orders,
        (o) => o.paymentMethodId ?? '-',
        (o) => o.paymentMethodName ?? '-',
      ),
      byCategory: productProfit(orders).byCategory.map((c) => ({
        key: c.categoryCode,
        label: c.productName,
        count: c.packs,
        packs: c.packs,
        amount: c.revenue,
      })),
      expenses: { total: expenseTotal, byCategory: expenseRows },
      purchases: purchases._sum.total ?? 0,
      waste: wasteTotal,
      netProfit: summary.grossProfit - expenseTotal - wasteTotal,
      pending,
      shifts,
    };
  }

  // ─────────────────────────────── Data ───────────────────────────────

  /**
   * Order selesai (bukan PENDING) pada rentang tanggal WITA: yang pernah lunas menurut
   * waktu approve, sisanya (ditolak/batal) menurut waktu dibuat.
   */
  private async loadOrders(
    from: string,
    to: string,
    where: Prisma.OrderWhereInput = {},
  ): Promise<CalcOrder[]> {
    const r = businessRange(from, to);
    const rows = await this.prisma.order.findMany({
      where: {
        AND: [
          { status: { not: 'PENDING' } },
          where,
          { OR: [{ approvedAt: r }, { approvedAt: null, createdAt: r }] },
        ],
      },
      select: orderSelect,
    });
    return rows.map((o) => ({
      id: o.id,
      status: o.status,
      source: o.source,
      subtotal: o.subtotal,
      discount: o.discount,
      total: o.total,
      hppTotal: o.hppTotal,
      approvedAt: o.approvedAt,
      paidAt: o.paidAt,
      createdAt: o.createdAt,
      paymentMethodId: o.paymentMethodId,
      paymentMethodName: o.paymentMethod?.name ?? null,
      paymentType: o.paymentMethod?.type ?? null,
      staffName: o.createdBy?.name ?? null,
      items: o.items.map((i) => ({
        productId: i.variant.productId,
        productName: i.productName,
        categoryCode: i.categoryCode,
        packSize: i.packSize,
        qty: i.qty,
        subtotal: i.subtotal,
        hppPerPack: i.hppPerPack,
      })),
    }));
  }

  private async loadExpenses(from: string, to: string) {
    const rows = await this.prisma.expense.findMany({
      where: { date: { gte: dateOnly(from), lte: dateOnly(to) } },
      select: {
        date: true,
        amount: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    });
    return rows.map((e) => ({
      date: e.date.toISOString().slice(0, 10),
      amount: e.amount,
      categoryId: e.categoryId,
      categoryName: e.category.name,
    }));
  }

  private groupExpenses(
    expenses: { amount: number; categoryId: string; categoryName: string }[],
  ): AmountRow[] {
    const map = new Map<string, AmountRow>();
    for (const e of expenses) {
      const row = map.get(e.categoryId) ?? {
        key: e.categoryId,
        label: e.categoryName,
        count: 0,
        amount: 0,
      };
      row.count += 1;
      row.amount += e.amount;
      map.set(e.categoryId, row);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }

  /**
   * Nilai barang rusak/basi (mutasi WASTE) per tanggal WITA. Produk yang belum punya biaya
   * rata-rata (stok awal tanpa produksi) dinilai dengan HPP teoretis resep.
   */
  private async wasteByDay(from: string, to: string): Promise<Map<string, number>> {
    const r = businessRange(from, to);
    const rows = await this.prisma.$queryRaw<
      {
        date: string;
        itemType: string;
        productId: string | null;
        value: number;
        zeroCostQty: number;
      }[]
    >`
      SELECT to_char((m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Makassar')::date, 'YYYY-MM-DD') AS date,
             m."itemType", m."productId",
             SUM(-m."qtyChange" * m."unitCost")::float8 AS value,
             SUM(CASE WHEN m."unitCost" = 0 THEN -m."qtyChange" ELSE 0 END)::float8 AS "zeroCostQty"
      FROM stock_movements m
      WHERE m.type = 'WASTE' AND m."createdAt" >= ${r.gte} AND m."createdAt" < ${r.lt}
      GROUP BY 1, 2, 3`;
    const fallback = rows.some((row) => row.productId && row.zeroCostQty)
      ? await this.productCostFallback()
      : () => null;
    const byDay = new Map<string, number>();
    for (const row of rows) {
      const extra = row.productId ? row.zeroCostQty * (fallback(row.productId) ?? 0) : 0;
      byDay.set(row.date, (byDay.get(row.date) ?? 0) + Math.round(row.value + extra));
    }
    return byDay;
  }

  private async productCostFallback(): Promise<(productId: string) => number | null> {
    const graph = await this.costing.graph();
    return (productId) => {
      try {
        return graph.productCostPerPcs(productId);
      } catch {
        return null;
      }
    };
  }
}
