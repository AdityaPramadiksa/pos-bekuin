import { Injectable } from '@nestjs/common';
import type { ProductionPlanView } from '@bekuin/shared';
import { assertDateKey, dateOnly } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { type PlanIngredient, planProduction } from './plan';

@Injectable()
export class ProductionPlanService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rekap dari order yang menunggu persetujuan atau sedang diproses untuk tanggal kirim terpilih.
   * Order yang sudah disetujui sudah memotong stok, jadi pcs-nya dikembalikan ke stok acuan
   * (barangnya masih harus disiapkan dari stok itu).
   */
  async plan(date: string): Promise<ProductionPlanView> {
    assertDateKey(date);
    const [orders, products, recipes, ingredients, packaging] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          deliveryDate: dateOnly(date),
          OR: [{ status: 'PENDING' }, { status: 'PAID', fulfillmentStatus: 'PROCESSING' }],
        },
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
    const approvedPcs = new Map<string, number>();
    for (const o of orders.filter((o) => o.status === 'PAID')) {
      for (const i of o.items) {
        const id = i.variant.productId;
        approvedPcs.set(id, (approvedPcs.get(id) ?? 0) + i.qty * i.packSize);
      }
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
      products: new Map(
        products.map((p) => [p.id, { stockPcs: p.stockPcs + (approvedPcs.get(p.id) ?? 0) }]),
      ),
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
