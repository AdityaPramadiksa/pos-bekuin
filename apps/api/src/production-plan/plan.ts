/**
 * Rekap produksi (PRD 5.13) — fungsi murni:
 * pcs per produk − stok → uraikan resep → adonan dibulatkan ke atas per batch →
 * bahan mentah & kemasan − stok → daftar belanja.
 */
import type { ProductionPlanView } from '@bekuin/shared';

export interface PlanItem {
  productId: string;
  productName: string;
  variantId: string;
  categoryCode: string;
  packSize: number;
  qty: number;
  subtotal: number;
}

export interface PlanIngredient {
  id: string;
  name: string;
  type: 'RAW' | 'SEMI_FINISHED' | 'PACKAGING';
  baseUnit: 'GRAM' | 'ML' | 'PCS';
  stockQty: number;
  purchaseQty: number;
  purchaseUnit: string | null;
  lastPrice: number;
}

export interface PlanInput {
  date: string;
  orders: { id: string; customerKey: string; items: PlanItem[] }[];
  products: Map<string, { stockPcs: number }>;
  /** Resep produk per 1 pcs. */
  productRecipes: Map<string, { recipeId: string; lines: { ingredientId: string; qty: number }[] }>;
  /** Resep setengah jadi, dikunci id bahan hasil. */
  semiRecipes: Map<
    string,
    { recipeId: string; yieldQty: number; lines: { ingredientId: string; qty: number }[] }
  >;
  ingredients: Map<string, PlanIngredient>;
  packaging: Map<string, { ingredientId: string; qty: number }[]>;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function planProduction(input: PlanInput): ProductionPlanView {
  const items = input.orders.flatMap((o) => o.items);

  // 1. Pcs per produk & per varian.
  const byProduct = new Map<string, ProductionPlanView['products'][number]>();
  const columns = new Map<string, { key: string; categoryCode: string; packSize: number }>();
  for (const item of items) {
    const key = `${item.categoryCode}|${item.packSize}`;
    columns.set(key, { key, categoryCode: item.categoryCode, packSize: item.packSize });
    const row = byProduct.get(item.productId) ?? {
      productId: item.productId,
      productName: item.productName,
      byVariant: {},
      totalPcs: 0,
      stockPcs: input.products.get(item.productId)?.stockPcs ?? 0,
      toProduce: 0,
      recipeId: input.productRecipes.get(item.productId)?.recipeId ?? null,
    };
    row.byVariant[key] = (row.byVariant[key] ?? 0) + item.qty;
    row.totalPcs += item.qty * item.packSize;
    byProduct.set(item.productId, row);
  }
  for (const row of byProduct.values())
    row.toProduce = Math.max(0, row.totalPcs - Math.max(0, row.stockPcs));

  // 2. Uraikan resep produk (per pcs) untuk pcs yang perlu dibuat.
  const need = new Map<string, number>();
  const add = (id: string, qty: number) => need.set(id, round4((need.get(id) ?? 0) + qty));
  for (const row of byProduct.values()) {
    for (const line of input.productRecipes.get(row.productId)?.lines ?? [])
      add(line.ingredientId, line.qty * row.toProduce);
  }

  // 3. Bahan setengah jadi: kurangi stok, bulatkan ke atas per batch, uraikan jadi bahan mentah (bisa bertingkat).
  const semiFinished: ProductionPlanView['semiFinished'] = [];
  const expanded = new Set<string>();
  for (let guard = 0; guard < 10; guard++) {
    const pending = [...need.keys()].filter((id) => input.semiRecipes.has(id) && !expanded.has(id));
    if (pending.length === 0) break;
    for (const id of pending) {
      expanded.add(id);
      const recipe = input.semiRecipes.get(id)!;
      const ing = input.ingredients.get(id)!;
      const total = need.get(id)!;
      const shortfall = Math.max(0, round4(total - Math.max(0, ing.stockQty)));
      const batches = Math.ceil(round4(shortfall / recipe.yieldQty));
      semiFinished.push({
        ingredientId: id,
        name: ing.name,
        baseUnit: ing.baseUnit,
        need: total,
        stock: ing.stockQty,
        shortfall,
        batches,
        batchYield: recipe.yieldQty,
        willMake: batches * recipe.yieldQty,
        recipeId: recipe.recipeId,
      });
      for (const line of recipe.lines) add(line.ingredientId, line.qty * batches);
    }
  }

  // 4. Kemasan per pack (semua pack, termasuk yang stok produknya sudah ada).
  for (const item of items) {
    for (const p of input.packaging.get(item.variantId) ?? [])
      add(p.ingredientId, p.qty * item.qty);
  }

  // 5. Bahan mentah & kemasan − stok → daftar belanja (estimasi dari harga beli terakhir).
  const materials: ProductionPlanView['materials'] = [];
  for (const [id, total] of need) {
    const ing = input.ingredients.get(id);
    if (!ing || ing.type === 'SEMI_FINISHED') continue;
    const shortage = Math.max(0, round4(total - Math.max(0, ing.stockQty)));
    const packsToBuy = shortage > 0 ? Math.ceil(round4(shortage / ing.purchaseQty)) : 0;
    materials.push({
      ingredientId: id,
      name: ing.name,
      type: ing.type,
      baseUnit: ing.baseUnit,
      need: total,
      stock: ing.stockQty,
      shortage,
      purchaseUnit: ing.purchaseUnit,
      packsToBuy,
      estimatedCost: packsToBuy * ing.lastPrice,
    });
  }
  materials.sort((a, b) =>
    a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'RAW' ? -1 : 1,
  );

  // 6. Daftar goreng (Siap Makan digoreng dari stok frozen di hari kirim).
  const fry = new Map<string, { productName: string; packSize: number; qty: number }>();
  for (const item of items.filter((i) => i.categoryCode === 'SIAP_MAKAN')) {
    const key = `${item.productName}|${item.packSize}`;
    const row = fry.get(key) ?? { productName: item.productName, packSize: item.packSize, qty: 0 };
    row.qty += item.qty;
    fry.set(key, row);
  }

  return {
    date: input.date,
    summary: {
      orders: input.orders.length,
      customers: new Set(input.orders.map((o) => o.customerKey)).size,
      packs: items.reduce((sum, i) => sum + i.qty, 0),
      pcs: items.reduce((sum, i) => sum + i.qty * i.packSize, 0),
      amount: items.reduce((sum, i) => sum + i.subtotal, 0),
    },
    products: [...byProduct.values()].sort((a, b) => b.totalPcs - a.totalPcs),
    variantColumns: [...columns.values()].sort((a, b) =>
      a.categoryCode === b.categoryCode
        ? a.packSize - b.packSize
        : a.categoryCode.localeCompare(b.categoryCode),
    ),
    semiFinished,
    materials,
    fryList: [...fry.values()],
    shoppingTotal: materials.reduce((sum, m) => sum + m.estimatedCost, 0),
  };
}
