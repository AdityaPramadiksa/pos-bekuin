import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type OpnameView, STOCK_UNIT_LABEL } from '@bekuin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { StockService } from '../stock/stock.service';
import type { CreateOpnameDto, UpdateOpnameDto } from './dto/opname.dto';

const include = {
  createdBy: { select: { name: true } },
  finalizedBy: { select: { name: true } },
  items: {
    include: {
      product: { select: { name: true } },
      ingredient: { select: { name: true, baseUnit: true } },
    },
    orderBy: [{ itemType: 'desc' }, { id: 'asc' }],
  },
} satisfies Prisma.StockOpnameInclude;

type OpnameRow = Prisma.StockOpnameGetPayload<{ include: typeof include }>;

function toView(o: OpnameRow): OpnameView {
  const items = o.items.map((i) => ({
    id: i.id,
    itemType: i.itemType,
    itemId: (i.productId ?? i.ingredientId)!,
    name: i.product?.name ?? i.ingredient?.name ?? '-',
    unit: i.product ? 'pcs' : STOCK_UNIT_LABEL[i.ingredient?.baseUnit ?? 'PCS'],
    systemQty: i.systemQty.toNumber(),
    physicalQty: i.physicalQty?.toNumber() ?? null,
    diffQty: i.diffQty.toNumber(),
    unitCost: i.unitCost.toNumber(),
    diffValue: i.diffValue,
  }));
  return {
    id: o.id,
    status: o.status,
    note: o.note,
    createdBy: o.createdBy.name,
    finalizedBy: o.finalizedBy?.name ?? null,
    createdAt: o.createdAt.toISOString(),
    finalizedAt: o.finalizedAt?.toISOString() ?? null,
    items,
    totalDiffValue: items.reduce((sum, i) => sum + i.diffValue, 0),
    countedItems: items.filter((i) => i.physicalQty !== null).length,
  };
}

@Injectable()
export class OpnamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(): Promise<OpnameView[]> {
    const rows = await this.prisma.stockOpname.findMany({
      include,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map(toView);
  }

  async get(id: string): Promise<OpnameView> {
    const row = await this.prisma.stockOpname.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Sesi opname tidak ditemukan');
    return toView(row);
  }

  /** Buat draft: catat stok sistem saat ini untuk item yang dipilih. */
  async create(dto: CreateOpnameDto, userId: string): Promise<OpnameView> {
    const [products, ingredients] = await Promise.all([
      dto.scope === 'INGREDIENT'
        ? []
        : this.prisma.product.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          }),
      dto.scope === 'PRODUCT'
        ? []
        : this.prisma.ingredient.findMany({
            where: { isActive: true, ...(dto.ingredientType ? { type: dto.ingredientType } : {}) },
            orderBy: [{ type: 'asc' }, { name: 'asc' }],
          }),
    ]);
    if (products.length + ingredients.length === 0)
      throw new BadRequestException('Tidak ada item untuk dihitung');
    const row = await this.prisma.stockOpname.create({
      data: {
        note: dto.note,
        createdById: userId,
        items: {
          create: [
            ...products.map((p) => ({
              itemType: 'PRODUCT' as const,
              productId: p.id,
              systemQty: p.stockPcs,
              unitCost: p.avgCostPerPcs,
            })),
            ...ingredients.map((i) => ({
              itemType: 'INGREDIENT' as const,
              ingredientId: i.id,
              systemQty: i.stockQty,
              unitCost: i.avgCostPerUnit,
            })),
          ],
        },
      },
      include,
    });
    return toView(row);
  }

  /** Simpan hitungan fisik (draft). Selisih & nilai rupiah dihitung otomatis. */
  async update(id: string, dto: UpdateOpnameDto): Promise<OpnameView> {
    await this.prisma.$transaction(async (tx) => {
      const opname = await tx.stockOpname.findUnique({ where: { id }, include: { items: true } });
      if (!opname) throw new NotFoundException('Sesi opname tidak ditemukan');
      if (opname.status !== 'DRAFT') throw new BadRequestException('Opname sudah difinalkan');
      const items = new Map(opname.items.map((i) => [i.id, i]));
      for (const count of dto.items) {
        const item = items.get(count.id);
        if (!item) throw new BadRequestException('Item opname tidak ditemukan');
        if (
          count.physicalQty !== null &&
          item.itemType === 'PRODUCT' &&
          !Number.isInteger(count.physicalQty)
        ) {
          throw new BadRequestException('Stok fisik produk harus bilangan bulat (pcs)');
        }
        const diff =
          count.physicalQty === null
            ? new Prisma.Decimal(0)
            : new Prisma.Decimal(count.physicalQty).minus(item.systemQty);
        await tx.stockOpnameItem.update({
          where: { id: item.id },
          data: {
            physicalQty: count.physicalQty,
            diffQty: diff,
            diffValue: Math.round(diff.mul(item.unitCost).toNumber()),
          },
        });
      }
      if (dto.note !== undefined)
        await tx.stockOpname.update({ where: { id }, data: { note: dto.note } });
    });
    return this.get(id);
  }

  /**
   * Finalisasi: stok disetel ke hitungan fisik lewat mutasi OPNAME_ADJUST.
   * Selisih dihitung ulang terhadap stok saat finalisasi (bisa berubah sejak draft dibuat).
   */
  async finalize(id: string, userId: string): Promise<OpnameView> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM stock_opnames WHERE id = ${id} FOR UPDATE`;
      const opname = await tx.stockOpname.findUnique({ where: { id }, include: { items: true } });
      if (!opname) throw new NotFoundException('Sesi opname tidak ditemukan');
      if (opname.status !== 'DRAFT') throw new BadRequestException('Opname sudah difinalkan');
      const counted = opname.items.filter((i) => i.physicalQty !== null);
      if (counted.length === 0) throw new BadRequestException('Belum ada item yang dihitung');

      const products = await tx.product.findMany({
        where: { id: { in: counted.flatMap((i) => (i.productId ? [i.productId] : [])) } },
      });
      const ingredients = await tx.ingredient.findMany({
        where: { id: { in: counted.flatMap((i) => (i.ingredientId ? [i.ingredientId] : [])) } },
      });
      const current = new Map<string, Prisma.Decimal>([
        ...products.map((p) => [p.id, new Prisma.Decimal(p.stockPcs)] as const),
        ...ingredients.map((i) => [i.id, i.stockQty] as const),
      ]);

      const changes = counted
        .map((i) => {
          const itemId = (i.productId ?? i.ingredientId)!;
          const now = current.get(itemId) ?? new Prisma.Decimal(0);
          return { item: i, itemId, now, delta: i.physicalQty!.minus(now) };
        })
        .filter((c) => !c.delta.isZero());
      await this.stock.apply(
        tx,
        changes.map((c) => ({ itemType: c.item.itemType, id: c.itemId, qty: c.delta })),
        { type: 'OPNAME_ADJUST', userId, refType: 'OPNAME', refId: id, note: 'Stok opname' },
        { allowNegativeIngredients: true, allowNegativeProducts: true },
      );
      for (const c of counted) {
        const itemId = (c.productId ?? c.ingredientId)!;
        const now = current.get(itemId) ?? new Prisma.Decimal(0);
        const diff = c.physicalQty!.minus(now);
        await tx.stockOpnameItem.update({
          where: { id: c.id },
          data: {
            systemQty: now,
            diffQty: diff,
            diffValue: Math.round(diff.mul(c.unitCost).toNumber()),
          },
        });
      }
      await tx.stockOpname.update({
        where: { id },
        data: { status: 'FINALIZED', finalizedById: userId, finalizedAt: new Date() },
      });
    });
    this.realtime.stockChanged();
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const opname = await this.prisma.stockOpname.findUnique({ where: { id } });
    if (!opname) throw new NotFoundException('Sesi opname tidak ditemukan');
    if (opname.status !== 'DRAFT')
      throw new BadRequestException('Opname yang sudah final tidak bisa dihapus');
    await this.prisma.stockOpname.delete({ where: { id } });
  }
}
