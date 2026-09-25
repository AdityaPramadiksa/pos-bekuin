import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ExpenseCategoryView, ExpenseView } from '@bekuin/shared';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { lockOpenCashSession } from '../cash-sessions/cash-sessions.service';
import { dateOnly, todayKey } from '../common/dates';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type {
  CreateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseCategoryDto,
  UpdateExpenseDto,
} from './dto/expense.dto';

const expenseInclude = {
  category: { select: { name: true } },
  paymentMethod: { select: { name: true, type: true } },
  cashSession: { select: { status: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.ExpenseInclude;
type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

function toView(e: ExpenseRow): ExpenseView {
  return {
    id: e.id,
    date: e.date.toISOString().slice(0, 10),
    categoryId: e.categoryId,
    categoryName: e.category.name,
    amount: e.amount,
    paymentMethodId: e.paymentMethodId,
    paymentMethodName: e.paymentMethod?.name ?? null,
    fromCashDrawer: e.paymentMethod?.type === 'CASH',
    note: e.note,
    photoUrl: e.photoUrl,
    cashSessionId: e.cashSessionId,
    locked: e.cashSession?.status === 'CLOSED',
    createdByName: e.createdBy.name,
    createdAt: e.createdAt.toISOString(),
  };
}

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ───────────────────────────── Kategori ─────────────────────────────

  async categories(includeInactive = false): Promise<ExpenseCategoryView[]> {
    return this.prisma.expenseCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, isActive: true, sortOrder: true },
    });
  }

  async createCategory(dto: CreateExpenseCategoryDto) {
    try {
      return await this.prisma.expenseCategory.create({ data: dto });
    } catch (error) {
      rethrowPrismaError(error, 'Nama kategori sudah ada');
    }
  }

  async updateCategory(id: string, dto: UpdateExpenseCategoryDto) {
    try {
      return await this.prisma.expenseCategory.update({ where: { id }, data: dto });
    } catch (error) {
      rethrowPrismaError(error, 'Nama kategori sudah ada');
    }
  }

  // ─────────────────────────── Pengeluaran ───────────────────────────

  async list(query: { from: string; to: string; categoryId?: string }): Promise<ExpenseView[]> {
    const rows = await this.prisma.expense.findMany({
      where: {
        date: { gte: dateOnly(query.from), lte: dateOnly(query.to) },
        categoryId: query.categoryId || undefined,
      },
      include: expenseInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return rows.map(toView);
  }

  async create(dto: CreateExpenseDto, user: JwtPayload): Promise<ExpenseView> {
    const id = await this.prisma.$transaction(async (tx) => {
      await this.assertCategory(tx, dto.categoryId);
      const cashSessionId = await this.linkSession(tx, dto.paymentMethodId, dto.date);
      const created = await tx.expense.create({
        data: {
          date: dateOnly(dto.date),
          categoryId: dto.categoryId,
          amount: dto.amount,
          paymentMethodId: dto.paymentMethodId,
          note: dto.note ?? null,
          photoUrl: dto.photoUrl ?? null,
          cashSessionId,
          createdById: user.sub,
        },
      });
      return created.id;
    });
    this.realtime.financeChanged();
    return this.get(id);
  }

  async update(id: string, dto: UpdateExpenseDto): Promise<ExpenseView> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.lockEditable(tx, id);
      if (dto.categoryId) await this.assertCategory(tx, dto.categoryId);
      const date = dto.date ?? current.date.toISOString().slice(0, 10);
      const paymentMethodId = dto.paymentMethodId ?? current.paymentMethodId;
      if (!paymentMethodId) throw new BadRequestException('Pilih dibayar dari mana');
      await tx.expense.update({
        where: { id },
        data: {
          date: dateOnly(date),
          categoryId: dto.categoryId,
          amount: dto.amount,
          paymentMethodId,
          note: dto.note,
          photoUrl: dto.photoUrl,
          // Pengeluaran lama yang tertaut ke shift terbuka tetap di shift itu.
          cashSessionId: current.cashSessionId
            ? (await this.isCash(tx, paymentMethodId))
              ? current.cashSessionId
              : null
            : await this.linkSession(tx, paymentMethodId, date),
        },
      });
    });
    this.realtime.financeChanged();
    return this.get(id);
  }

  async remove(id: string): Promise<{ ok: true }> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockEditable(tx, id);
      await tx.expense.delete({ where: { id } });
    });
    this.realtime.financeChanged();
    return { ok: true };
  }

  private async get(id: string): Promise<ExpenseView> {
    const row = await this.prisma.expense.findUnique({ where: { id }, include: expenseInclude });
    if (!row) throw new NotFoundException('Pengeluaran tidak ditemukan');
    return toView(row);
  }

  /** Pengeluaran yang shift-nya sudah ditutup tidak boleh diubah (rekap shift sudah final). */
  private async lockEditable(tx: Prisma.TransactionClient, id: string) {
    await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${id} FOR UPDATE`;
    const row = await tx.expense.findUnique({
      where: { id },
      include: { cashSession: { select: { status: true } } },
    });
    if (!row) throw new NotFoundException('Pengeluaran tidak ditemukan');
    if (row.cashSession?.status === 'CLOSED') {
      throw new ConflictException('Shift pengeluaran ini sudah ditutup, tidak bisa diubah');
    }
    if (row.cashSessionId) await lockOpenCashSession(tx);
    return row;
  }

  private async assertCategory(tx: Prisma.TransactionClient, id: string) {
    const category = await tx.expenseCategory.findUnique({ where: { id } });
    if (!category?.isActive) throw new BadRequestException('Kategori pengeluaran tidak valid');
  }

  private async isCash(tx: Prisma.TransactionClient, paymentMethodId: string) {
    const method = await tx.paymentMethod.findUnique({ where: { id: paymentMethodId } });
    if (!method) throw new BadRequestException('Metode bayar tidak valid');
    return method.type === 'CASH';
  }

  /** Pengeluaran cash hari ini saat shift terbuka → tertaut ke shift (mengurangi kas laci). */
  private async linkSession(tx: Prisma.TransactionClient, paymentMethodId: string, date: string) {
    if (!(await this.isCash(tx, paymentMethodId)) || date !== todayKey()) return null;
    return lockOpenCashSession(tx);
  }
}
