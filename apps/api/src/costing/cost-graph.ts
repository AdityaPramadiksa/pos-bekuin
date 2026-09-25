import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Decimal = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export interface CostIngredient {
  id: string;
  name: string;
  type: 'RAW' | 'SEMI_FINISHED' | 'PACKAGING';
  avgCostPerUnit: Prisma.Decimal.Value;
}

export interface CostRecipe {
  id: string;
  name: string;
  type: 'SEMI_FINISHED' | 'PRODUCT';
  yieldQty: Prisma.Decimal.Value;
  outputIngredientId: string | null;
  productId: string | null;
  lines: { ingredientId: string; qty: Prisma.Decimal.Value }[];
}

export interface CostLine {
  ingredientId: string;
  name: string;
  qty: number;
  unitCost: number;
  cost: number;
}

/** HPP per pcs dibulatkan ke Rp10 terdekat (konvensi tabel PRD 7.3/7.5). */
export const roundTo10 = (n: number) => Math.round(n / 10) * 10;

/**
 * Graf biaya resep bertingkat (fungsi murni, tanpa DB):
 * bahan setengah jadi = Σ(qty × biaya bahan) ÷ hasil resep (rekursif).
 */
export class CostGraph {
  private readonly ingredients: Map<string, CostIngredient>;
  private readonly recipeByOutput = new Map<string, CostRecipe>();
  private readonly recipeByProduct = new Map<string, CostRecipe>();
  private readonly cache = new Map<string, Decimal>();

  constructor(ingredients: CostIngredient[], recipes: CostRecipe[]) {
    this.ingredients = new Map(ingredients.map((i) => [i.id, i]));
    for (const r of recipes) {
      if (r.outputIngredientId) this.recipeByOutput.set(r.outputIngredientId, r);
      if (r.productId) this.recipeByProduct.set(r.productId, r);
    }
  }

  /** Biaya per satuan dasar. Setengah jadi dengan resep → dihitung dari resep; lainnya biaya rata-rata. */
  unitCost(ingredientId: string, path: string[] = []): Decimal {
    const cached = this.cache.get(ingredientId);
    if (cached) return cached;
    const ingredient = this.ingredients.get(ingredientId);
    if (!ingredient) throw new BadRequestException(`Bahan tidak ditemukan: ${ingredientId}`);
    const recipe =
      ingredient.type === 'SEMI_FINISHED' ? this.recipeByOutput.get(ingredientId) : undefined;
    if (!recipe) return D(ingredient.avgCostPerUnit);

    if (path.includes(ingredientId)) {
      const names = [...path, ingredientId].map((id) => this.ingredients.get(id)?.name ?? id);
      throw new BadRequestException(`Resep melingkar: ${names.join(' → ')}`);
    }
    const total = this.linesTotal(recipe, [...path, ingredientId]);
    const perUnit = total.div(D(recipe.yieldQty));
    this.cache.set(ingredientId, perUnit);
    return perUnit;
  }

  private linesTotal(recipe: CostRecipe, path: string[]): Decimal {
    return recipe.lines.reduce(
      (sum, l) => sum.plus(D(l.qty).mul(this.unitCost(l.ingredientId, path))),
      D(0),
    );
  }

  /** Rincian biaya satu resep. */
  breakdown(recipe: CostRecipe): { lines: CostLine[]; total: number; perUnit: number } {
    const path = recipe.outputIngredientId ? [recipe.outputIngredientId] : [];
    const lines = recipe.lines.map((l) => {
      const unitCost = this.unitCost(l.ingredientId, path);
      return {
        ingredientId: l.ingredientId,
        name: this.ingredients.get(l.ingredientId)?.name ?? '-',
        qty: D(l.qty).toNumber(),
        unitCost: unitCost.toDecimalPlaces(4).toNumber(),
        cost: D(l.qty).mul(unitCost).toDecimalPlaces(2).toNumber(),
      };
    });
    const total = this.linesTotal(recipe, path);
    return {
      lines,
      total: total.toDecimalPlaces(2).toNumber(),
      perUnit: total.div(D(recipe.yieldQty)).toDecimalPlaces(4).toNumber(),
    };
  }

  /** HPP teoretis per pcs produk dari resep (null bila belum ada resep). */
  productCostPerPcs(productId: string): number | null {
    const recipe = this.recipeByProduct.get(productId);
    if (!recipe) return null;
    return this.linesTotal(recipe, []).div(D(recipe.yieldQty)).toNumber();
  }

  /** Apakah resep dengan output `outputId` yang memakai bahan `lineIds` akan membuat lingkaran. */
  static assertNoCycle(
    ingredients: CostIngredient[],
    recipes: CostRecipe[],
    candidate: CostRecipe,
  ): void {
    const others = recipes.filter((r) => r.id !== candidate.id);
    const graph = new CostGraph(ingredients, [...others, candidate]);
    if (candidate.outputIngredientId) graph.unitCost(candidate.outputIngredientId);
    else graph.breakdown(candidate);
  }
}

/** HPP per pack = pack × HPP per pcs (bulat Rp10) + Σ kemasan. */
export function packHpp(costPerPcs: number, packSize: number, packagingCost: number): number {
  return Math.round(packSize * roundTo10(costPerPcs) + packagingCost);
}
