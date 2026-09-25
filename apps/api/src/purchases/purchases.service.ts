import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PurchaseView } from '@bekuin/shared';
import { assertDateKey, dateOnly, todayKey } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { StockService } from '../stock/stock.service';
import type { CreatePurchaseDto } from './dto/purchase.dto';

const include = {
  items: { include: { ingredient: { select: { name: true, baseUnit: true } } } },
  createdBy: { select: { name: true } },
} satisfies Prisma.PurchaseInclude;

function toView(p: Prisma.PurchaseGetPayload<{ include: typeof include }>): PurchaseView {
  return {
    id: p.id,
    date: p.date.toISOString().slice(0, 10),
    supplier: p.supplier,
    note: p.note,
    total: p.total,
    photoUrl: p.photoUrl,
    createdBy: p.createdBy.name,
    createdAt: p.createdAt.toISOString(),
    items: p.items.map((i) => ({
      ingredientId: i.ingredientId,
      name: i.ingredient.name,
      baseUnit: i.ingredient.baseUnit,
      packQty: i.packQty.toNumber(),
      qtyBase: i.qtyBase.toNumber(),
      totalPrice: i.totalPrice,
      unitCost: i.unitCost.toNumber(),
    })),
  };
}

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(from?: string, to?: string): Promise<PurchaseView[]> {
    const where: Prisma.PurchaseWhereInput = {};
    if (from || to) where.date = { gte: dateOnly(from ?? to!), lte: dateOnly(to ?? from!) };
    const rows = await this.prisma.purchase.findMany({
      where,
      include,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map(toView);
  }

  /**
   * Stok masuk: konversi ke satuan dasar (2 pack × 2.000 g = 4.000 g), stok bertambah,
   * biaya rata-rata tertimbang diperbarui, harga beli terakhir dicatat.
   */
  async create(dto: CreatePurchaseDto, userId: string): Promise<PurchaseView> {
    assertDateKey(dto.date);
    if (dto.date > todayKey())
      throw new BadRequestException('Tanggal belanja tidak boleh di masa depan');
    const ids = dto.items.map((i) => i.ingredientId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Bahan yang sama muncul lebih dari sekali');

    const id = await this.prisma.$transaction(async (tx) => {
      const ingredients = await tx.ingredient.findMany({ where: { id: { in: ids } } });
      const byId = new Map(ingredients.map((i) => [i.id, i]));
      const items = dto.items.map((item) => {
        const ing = byId.get(item.ingredientId);
        if (!ing) throw new BadRequestException('Bahan tidak ditemukan');
        if (ing.type === 'SEMI_FINISHED')
          throw new BadRequestException(`${ing.name} adalah hasil produksi, bukan dibeli`);
        const qtyBase = new Prisma.Decimal(item.packQty).mul(ing.purchaseQty);
        return {
          ...item,
          ing,
          qtyBase,
          unitCost: new Prisma.Decimal(item.totalPrice).div(qtyBase),
        };
      });

      const purchase = await tx.purchase.create({
        data: {
          date: dateOnly(dto.date),
          supplier: dto.supplier ?? null,
          note: dto.note ?? null,
          photoUrl: dto.photoUrl ?? null,
          total: items.reduce((sum, i) => sum + i.totalPrice, 0),
          createdById: userId,
          items: {
            create: items.map((i) => ({
              ingredientId: i.ingredientId,
              packQty: i.packQty,
              qtyBase: i.qtyBase,
              totalPrice: i.totalPrice,
              unitCost: i.unitCost.toDecimalPlaces(4),
            })),
          },
        },
      });
      await this.stock.apply(
        tx,
        items.map((i) => ({
          itemType: 'INGREDIENT' as const,
          id: i.ingredientId,
          qty: i.qtyBase,
          unitCost: i.unitCost,
        })),
        {
          type: 'PURCHASE',
          userId,
          refType: 'PURCHASE',
          refId: purchase.id,
          note: dto.supplier ?? undefined,
        },
        { updateAverageCost: true },
      );
      for (const i of items) {
        await tx.ingredient.update({
          where: { id: i.ingredientId },
          data: { lastPrice: Math.round(i.totalPrice / i.packQty) },
        });
      }
      return purchase.id;
    });
    this.realtime.stockChanged();
    return toView(await this.prisma.purchase.findUniqueOrThrow({ where: { id }, include }));
  }
}
