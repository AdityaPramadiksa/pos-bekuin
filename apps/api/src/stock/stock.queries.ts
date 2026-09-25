import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type IngredientStockView,
  type ProductStockView,
  STOCK_UNIT_LABEL,
  type StockMovementView,
  stockStatus,
} from '@bekuin/shared';
import { businessRange } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import type { MovementQueryDto } from './dto/stock.dto';

@Injectable()
export class StockQueries {
  constructor(private readonly prisma: PrismaService) {}

  async products(): Promise<ProductStockView[]> {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return products.map((p) => ({
      id: p.id,
      name: p.name,
      stockPcs: p.stockPcs,
      minStockPcs: p.minStockPcs,
      avgCostPerPcs: p.avgCostPerPcs.toNumber(),
      status: stockStatus(p.stockPcs, p.minStockPcs),
      isActive: p.isActive,
    }));
  }

  async ingredients(type?: string): Promise<IngredientStockView[]> {
    const where: Prisma.IngredientWhereInput = { isActive: true };
    if (type === 'RAW' || type === 'SEMI_FINISHED' || type === 'PACKAGING') where.type = type;
    const ingredients = await this.prisma.ingredient.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return ingredients.map((i) => ({
      id: i.id,
      name: i.name,
      type: i.type,
      baseUnit: i.baseUnit,
      stockQty: i.stockQty.toNumber(),
      minStock: i.minStock.toNumber(),
      avgCostPerUnit: i.avgCostPerUnit.toNumber(),
      status: stockStatus(i.stockQty.toNumber(), i.minStock.toNumber()),
      isActive: i.isActive,
    }));
  }

  async movements(query: MovementQueryDto): Promise<StockMovementView[]> {
    const where: Prisma.StockMovementWhereInput = {};
    if (query.itemType) where.itemType = query.itemType;
    if (query.itemId) where.OR = [{ productId: query.itemId }, { ingredientId: query.itemId }];
    if (query.type) where.type = query.type as Prisma.StockMovementWhereInput['type'];
    if (query.from || query.to) where.createdAt = businessRange(query.from, query.to ?? query.from);

    const rows = await this.prisma.stockMovement.findMany({
      where,
      include: {
        product: { select: { name: true } },
        ingredient: { select: { name: true, baseUnit: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 100,
    });
    return rows.map((m) => ({
      id: m.id,
      itemType: m.itemType,
      itemId: (m.productId ?? m.ingredientId)!,
      itemName: m.product?.name ?? m.ingredient?.name ?? '-',
      unit: m.product ? 'pcs' : STOCK_UNIT_LABEL[m.ingredient?.baseUnit ?? 'PCS'],
      type: m.type,
      qtyChange: m.qtyChange.toNumber(),
      balanceAfter: m.balanceAfter.toNumber(),
      unitCost: m.unitCost.toNumber(),
      refType: m.refType,
      refId: m.refId,
      note: m.note,
      userName: m.user.name,
      createdAt: m.createdAt.toISOString(),
    }));
  }
}
