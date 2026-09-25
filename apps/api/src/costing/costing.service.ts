import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CostGraph, type CostIngredient, type CostRecipe, roundTo10 } from './cost-graph';

type Db = PrismaService | Prisma.TransactionClient;

/** Memuat bahan & resep dari DB menjadi CostGraph (HPP teoretis, selalu mengikuti harga terbaru). */
@Injectable()
export class CostingService {
  constructor(private readonly prisma: PrismaService) {}

  async graph(db: Db = this.prisma): Promise<CostGraph> {
    const [ingredients, recipes] = await Promise.all([
      this.loadIngredients(db),
      this.loadRecipes(db),
    ]);
    return new CostGraph(ingredients, recipes);
  }

  async loadIngredients(db: Db = this.prisma): Promise<CostIngredient[]> {
    const rows = await db.ingredient.findMany({
      select: { id: true, name: true, type: true, avgCostPerUnit: true },
    });
    return rows;
  }

  async loadRecipes(db: Db = this.prisma): Promise<CostRecipe[]> {
    const rows = await db.recipe.findMany({ where: { isActive: true }, include: { lines: true } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      yieldQty: r.yieldQty,
      outputIngredientId: r.outputIngredientId,
      productId: r.productId,
      lines: r.lines.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty })),
    }));
  }

  /**
   * Snapshot HPP per pack saat approve: biaya rata-rata aktual per pcs (hasil produksi) bila ada,
   * selain itu HPP teoretis resep (dibulatkan Rp10), ditambah kemasan varian.
   */
  hppPerPack(
    graph: CostGraph,
    item: {
      packSize: number;
      product: { id: string; avgCostPerPcs: Prisma.Decimal };
      packaging: { qty: Prisma.Decimal; ingredientId: string }[];
    },
  ): number {
    const actual = item.product.avgCostPerPcs.toNumber();
    const perPcs = actual > 0 ? actual : roundTo10(graph.productCostPerPcs(item.product.id) ?? 0);
    const packaging = item.packaging.reduce(
      (sum, p) => sum + p.qty.toNumber() * graph.unitCost(p.ingredientId).toNumber(),
      0,
    );
    return Math.round(item.packSize * perPcs + packaging);
  }
}
