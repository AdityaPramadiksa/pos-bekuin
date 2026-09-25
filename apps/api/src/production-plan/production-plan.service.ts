import { Injectable } from '@nestjs/common';
import type { ProductionPlanView } from '@bekuin/shared';
import { assertDateKey, dateOnly } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { type PlanIngredient, planProduction } from './plan';

@Injectable()
export class ProductionPlanService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rekap dari order PENDING dengan tanggal kirim terpilih (PAID sudah memotong stok). */
  async plan(date: string): Promise<ProductionPlanView> {
    assertDateKey(date);
    const [orders, products, recipes, ingredients, packaging] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: 'PENDING', deliveryDate: dateOnly(date) },
        include: { items: { include: { variant: { select: { productId: true } } } } },
      }),
      this.prisma.product.findMany({ select: { id: true, stockPcs: true } }),
      this.prisma.recipe.findMany({ where: { isActive: true }, include: { lines: true } }),
      this.prisma.ingredient.findMany(),
      this.prisma.variantPackaging.findMany(),
    ]);
    const packagingByVariant = new Map<string, { ingredientId: string; qty: number }[]>();
    for (const p of packaging) {
      packagingByVariant.set(p.variantId, [
        ...(packagingByVariant.get(p.variantId) ?? []),
        { ingredientId: p.ingredientId, qty: p.qty.toNumber() },
      ]);
    }
    const lines = (r: (typeof recipes)[number]) =>
      r.lines.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty.toNumber() }));
    return planProduction({
      date,
      orders: orders.map((o) => ({
        id: o.id,
        customerKey: o.customerId ?? o.customerName ?? o.id,
        items: o.items.map((i) => ({
          productId: i.variant.productId,
          productName: i.productName,
          variantId: i.variantId,
          categoryCode: i.categoryCode,
          packSize: i.packSize,
          qty: i.qty,
          subtotal: i.subtotal,
        })),
      })),
      products: new Map(products.map((p) => [p.id, { stockPcs: p.stockPcs }])),
      productRecipes: new Map(
        recipes
          .filter((r) => r.productId)
          .map((r) => [r.productId!, { recipeId: r.id, lines: lines(r) }]),
      ),
      semiRecipes: new Map(
        recipes
          .filter((r) => r.outputIngredientId)
          .map((r) => [
            r.outputIngredientId!,
            { recipeId: r.id, yieldQty: r.yieldQty.toNumber(), lines: lines(r) },
          ]),
      ),
      ingredients: new Map(
        ingredients.map((i) => [
          i.id,
          {
            id: i.id,
            name: i.name,
            type: i.type,
            baseUnit: i.baseUnit,
            stockQty: i.stockQty.toNumber(),
            purchaseQty: i.purchaseQty.toNumber(),
            purchaseUnit: i.purchaseUnit,
            lastPrice: i.lastPrice,
          } satisfies PlanIngredient,
        ]),
      ),
      packaging: packagingByVariant,
    });
  }
}
