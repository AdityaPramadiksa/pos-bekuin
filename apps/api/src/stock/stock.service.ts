import { BadRequestException, Injectable } from '@nestjs/common';
import { MovementType, Prisma } from '@prisma/client';
import { STOCK_UNIT_LABEL } from '@bekuin/shared';
import {
  formatShortages,
  itemKey,
  type PlanOptions,
  planStock,
  type PlannedChange,
  type StockChange,
  type StockRow,
} from './stock-plan';

export interface MovementMeta {
  type: MovementType;
  userId: string;
  refType?: string;
  refId?: string;
  note?: string;
}

/** Error stok kurang: pesan ringkas + daftar item untuk ditampilkan di UI. */
export class StockShortageException extends BadRequestException {
  constructor(shortages: ReturnType<typeof planStock>['shortages']) {
    super({ message: formatShortages(shortages), shortages, error: 'StockShortage' });
  }
}

/**
 * Satu-satunya pintu perubahan stok (lihat .claude/skills/bekuin-stok).
 * Wajib dipanggil di dalam prisma.$transaction: baris dikunci FOR UPDATE (urut id agar tidak deadlock),
 * saldo dihitung, lalu setiap perubahan dicatat di stock_movements.
 */
@Injectable()
export class StockService {
  async apply(
    tx: Prisma.TransactionClient,
    changes: StockChange[],
    meta: MovementMeta,
    options: PlanOptions = {},
  ): Promise<PlannedChange[]> {
    if (changes.length === 0) return [];
    const rows = await this.lockRows(tx, changes);
    const { planned, shortages } = planStock(rows, changes, options);
    if (shortages.length) throw new StockShortageException(shortages);

    for (const p of planned) {
      if (p.itemType === 'PRODUCT') {
        await tx.product.update({
          where: { id: p.id },
          data: { stockPcs: p.balanceAfter.toNumber(), avgCostPerPcs: p.newAvgCost },
        });
      } else {
        await tx.ingredient.update({
          where: { id: p.id },
          data: { stockQty: p.balanceAfter, avgCostPerUnit: p.newAvgCost },
        });
      }
      await tx.stockMovement.create({
        data: {
          itemType: p.itemType,
          productId: p.itemType === 'PRODUCT' ? p.id : null,
          ingredientId: p.itemType === 'INGREDIENT' ? p.id : null,
          type: meta.type,
          qtyChange: p.qtyChange,
          balanceAfter: p.balanceAfter,
          unitCost: p.unitCost,
          refType: meta.refType,
          refId: meta.refId,
          note: meta.note,
          userId: meta.userId,
        },
      });
    }
    return planned;
  }

  private async lockRows(tx: Prisma.TransactionClient, changes: StockChange[]) {
    const productIds = [
      ...new Set(changes.filter((c) => c.itemType === 'PRODUCT').map((c) => c.id)),
    ].sort();
    const ingredientIds = [
      ...new Set(changes.filter((c) => c.itemType === 'INGREDIENT').map((c) => c.id)),
    ].sort();
    const rows = new Map<string, StockRow>();

    if (productIds.length) {
      const products = await tx.$queryRaw<
        { id: string; name: string; stockPcs: number; avgCostPerPcs: Prisma.Decimal }[]
      >`
        SELECT id, name, "stockPcs", "avgCostPerPcs" FROM products
        WHERE id IN (${Prisma.join(productIds)}) ORDER BY id FOR UPDATE`;
      for (const p of products) {
        rows.set(itemKey('PRODUCT', p.id), {
          itemType: 'PRODUCT',
          id: p.id,
          name: p.name,
          unit: 'pcs',
          qty: new Prisma.Decimal(p.stockPcs),
          avgCost: new Prisma.Decimal(p.avgCostPerPcs),
        });
      }
    }
    if (ingredientIds.length) {
      const ingredients = await tx.$queryRaw<
        {
          id: string;
          name: string;
          stockQty: Prisma.Decimal;
          avgCostPerUnit: Prisma.Decimal;
          baseUnit: 'GRAM' | 'ML' | 'PCS';
        }[]
      >`
        SELECT id, name, "stockQty", "avgCostPerUnit", "baseUnit"::text AS "baseUnit" FROM ingredients
        WHERE id IN (${Prisma.join(ingredientIds)}) ORDER BY id FOR UPDATE`;
      for (const i of ingredients) {
        rows.set(itemKey('INGREDIENT', i.id), {
          itemType: 'INGREDIENT',
          id: i.id,
          name: i.name,
          unit: STOCK_UNIT_LABEL[i.baseUnit],
          qty: new Prisma.Decimal(i.stockQty),
          avgCost: new Prisma.Decimal(i.avgCostPerUnit),
        });
      }
    }
    return rows;
  }
}
