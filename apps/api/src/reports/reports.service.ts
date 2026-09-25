import { Injectable } from '@nestjs/common';
import type { TodaySummary } from '@bekuin/shared';
import { addDays, businessRange, dateOnly, todayKey } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async today(): Promise<TodaySummary> {
    const date = todayKey();
    const range = businessRange(date);
    const [pending, paid, byMethod, methods, lowProducts, lowIngredients] = await Promise.all([
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
    };
  }
}
