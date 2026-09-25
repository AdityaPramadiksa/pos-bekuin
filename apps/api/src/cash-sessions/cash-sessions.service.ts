import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AmountRow, CashSessionSummary, CashSessionView } from '@bekuin/shared';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { businessRange } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { allocateDiscount, CATEGORY_LABEL, expectedCash } from '../reports/calc';

type Db = PrismaService | Prisma.TransactionClient;

/** Kunci advisory agar pembukaan shift tidak balapan (hanya satu shift terbuka). */
const OPEN_SHIFT_LOCK = 7_240_001;

const sessionInclude = {
  openedBy: { select: { name: true } },
  closedBy: { select: { name: true } },
} satisfies Prisma.CashSessionInclude;
type SessionRow = Prisma.CashSessionGetPayload<{ include: typeof sessionInclude }>;

/**
 * Shift yang sedang terbuka, dikunci FOR SHARE sampai transaksi selesai supaya
 * tidak bisa ditutup di tengah approve/pengeluaran cash. null bila tidak ada.
 */
export async function lockOpenCashSession(tx: Prisma.TransactionClient): Promise<string | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM cash_sessions WHERE status = 'OPEN' FOR SHARE`;
  return rows[0]?.id ?? null;
}

@Injectable()
export class CashSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async current(): Promise<CashSessionView | null> {
    const row = await this.prisma.cashSession.findFirst({
      where: { status: 'OPEN' },
      include: sessionInclude,
    });
    return row ? this.toView(this.prisma, row) : null;
  }

  async get(id: string): Promise<CashSessionView> {
    const row = await this.prisma.cashSession.findUnique({
      where: { id },
      include: sessionInclude,
    });
    if (!row) throw new NotFoundException('Shift tidak ditemukan');
    return this.toView(this.prisma, row);
  }

  /** Riwayat shift yang dibuka pada rentang tanggal (WITA), terbaru dulu. */
  async list(from?: string, to?: string): Promise<CashSessionView[]> {
    const rows = await this.prisma.cashSession.findMany({
      where: { openedAt: businessRange(from, to) },
      include: sessionInclude,
      orderBy: { openedAt: 'desc' },
      take: 100,
    });
    return Promise.all(rows.map((r) => this.toView(this.prisma, r)));
  }

  async open(
    dto: { openingCash: number; note?: string | null },
    user: JwtPayload,
  ): Promise<CashSessionView> {
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${OPEN_SHIFT_LOCK})`;
      const existing = await tx.cashSession.findFirst({ where: { status: 'OPEN' } });
      if (existing) throw new ConflictException('Masih ada shift yang terbuka. Tutup dulu.');
      const created = await tx.cashSession.create({
        data: { openingCash: dto.openingCash, note: dto.note ?? null, openedById: user.sub },
      });
      return created.id;
    });
    this.realtime.financeChanged();
    return this.get(id);
  }

  /** Tutup shift: hitung kas seharusnya, catat uang fisik & selisih. */
  async close(
    id: string,
    dto: { countedCash: number; note?: string | null },
    user: JwtPayload,
  ): Promise<CashSessionView> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cash_sessions WHERE id = ${id} FOR UPDATE`;
      const row = await tx.cashSession.findUnique({ where: { id }, include: sessionInclude });
      if (!row) throw new NotFoundException('Shift tidak ditemukan');
      if (row.status !== 'OPEN') throw new ConflictException('Shift ini sudah ditutup');
      const closedAt = new Date();
      const summary = await this.summary(tx, { ...row, closedAt });
      const difference = dto.countedCash - summary.expectedCash;
      if (difference !== 0 && !dto.note) {
        throw new BadRequestException('Ada selisih kas. Tulis catatan penyebabnya.');
      }
      await tx.cashSession.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedAt,
          closedById: user.sub,
          expectedCash: summary.expectedCash,
          countedCash: dto.countedCash,
          difference,
          note: [row.note, dto.note].filter(Boolean).join(' · ') || null,
        },
      });
    });
    this.realtime.financeChanged();
    return this.get(id);
  }

  /** Ringkasan shift: order yang di-approve selama shift terbuka + kas laci yang tertaut. */
  async summary(
    db: Db,
    s: { id: string; openedAt: Date; closedAt: Date | null; openingCash: number },
  ): Promise<CashSessionSummary> {
    const window = { gte: s.openedAt, lte: s.closedAt ?? new Date() };
    const [orders, expenses] = await Promise.all([
      db.order.findMany({
        where: {
          OR: [{ status: { in: ['PAID', 'VOIDED'] }, approvedAt: window }, { cashSessionId: s.id }],
        },
        select: {
          status: true,
          total: true,
          discount: true,
          paidAt: true,
          cashSessionId: true,
          paymentMethodId: true,
          paymentMethod: { select: { name: true, type: true } },
          items: { select: { categoryCode: true, qty: true, subtotal: true } },
        },
      }),
      db.expense.findMany({
        where: { cashSessionId: s.id },
        select: { amount: true, paymentMethod: { select: { type: true } } },
      }),
    ]);
    const paid = orders.filter((o) => o.status === 'PAID');
    const voided = orders.filter((o) => o.status === 'VOIDED');
    const cashSales = paid
      .filter((o) => o.cashSessionId === s.id && o.paymentMethod?.type === 'CASH')
      .reduce((sum, o) => sum + o.total, 0);
    const cashExpenses = expenses
      .filter((e) => e.paymentMethod?.type === 'CASH')
      .reduce((sum, e) => sum + e.amount, 0);

    const byMethod = new Map<string, AmountRow>();
    const byCategory = new Map<string, AmountRow & { packs: number }>();
    for (const o of paid) {
      // Order disetujui yang uangnya belum diterima (COD) dipisah dari metode bayarnya.
      const key = o.paidAt ? (o.paymentMethodId ?? '-') : 'unpaid';
      const m = byMethod.get(key) ?? {
        key,
        label: o.paidAt ? (o.paymentMethod?.name ?? '-') : 'Belum dibayar',
        count: 0,
        amount: 0,
      };
      m.count += 1;
      m.amount += o.total;
      byMethod.set(key, m);
      const shares = allocateDiscount(
        o.items.map((i) => i.subtotal),
        o.discount,
      );
      o.items.forEach((item, idx) => {
        const c = byCategory.get(item.categoryCode) ?? {
          key: item.categoryCode,
          label: CATEGORY_LABEL[item.categoryCode] ?? item.categoryCode,
          count: 0,
          packs: 0,
          amount: 0,
        };
        c.count += 1;
        c.packs += item.qty;
        c.amount += item.subtotal - shares[idx];
        byCategory.set(item.categoryCode, c);
      });
    }
    return {
      orders: paid.length,
      sales: paid.reduce((sum, o) => sum + o.total, 0),
      cashSales,
      cashExpenses,
      byMethod: [...byMethod.values()].sort((a, b) => b.amount - a.amount),
      byCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
      voided: { count: voided.length, amount: voided.reduce((sum, o) => sum + o.total, 0) },
      expenses: { count: expenses.length, amount: expenses.reduce((sum, e) => sum + e.amount, 0) },
      expectedCash: expectedCash(s.openingCash, cashSales, cashExpenses),
    };
  }

  async toView(db: Db, row: SessionRow): Promise<CashSessionView> {
    return {
      id: row.id,
      status: row.status,
      openedAt: row.openedAt.toISOString(),
      openedByName: row.openedBy.name,
      openingCash: row.openingCash,
      closedAt: row.closedAt?.toISOString() ?? null,
      closedByName: row.closedBy?.name ?? null,
      expectedCash: row.expectedCash,
      countedCash: row.countedCash,
      difference: row.difference,
      note: row.note,
      summary: await this.summary(db, row),
    };
  }
}
