import type { ImportCatalog } from '@bekuin/shared';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { INGREDIENTS, PACKAGING, PRODUCTS, SEMI_FINISHED, VARIANTS } from '../../prisma/seed-data';
import { parseOrderText } from '../order-import/parser';
import { type PlanIngredient, type PlanInput, planProduction } from './plan';

/** Input rekap dari data seeder (id = nama) dengan stok awal 0, order dari fixture WhatsApp. */
function seedInput(): PlanInput {
  const catalog: ImportCatalog = {
    products: PRODUCTS.map((p) => ({
      id: p.name,
      name: p.name,
      variants: VARIANTS.filter(([n]) => n === p.name).map(([n, c, pack, price]) => ({
        id: `${n}|${c}|${pack}`,
        categoryCode: c,
        packSize: pack,
        price,
      })),
    })),
    aliases: PRODUCTS.flatMap((p) => p.aliases.map((alias) => ({ alias, productId: p.name }))),
  };
  const text = readFileSync(
    path.resolve(__dirname, '../../../../docs/fixtures/wa-order-sample.txt'),
    'utf8',
  );
  const parsed = parseOrderText(text, catalog, { today: '2026-09-25' });

  const ingredients = new Map<string, PlanIngredient>([
    ...INGREDIENTS.map(
      ([name, type, baseUnit, purchaseUnit, purchaseQty, lastPrice]) =>
        [
          name,
          { id: name, name, type, baseUnit, stockQty: 0, purchaseQty, purchaseUnit, lastPrice },
        ] as const,
    ),
    ...SEMI_FINISHED.map(
      (r) =>
        [
          r.name,
          {
            id: r.name,
            name: r.name,
            type: 'SEMI_FINISHED' as const,
            baseUnit: r.unit,
            stockQty: 0,
            purchaseQty: r.yieldQty,
            purchaseUnit: null,
            lastPrice: 0,
          },
        ] as const,
    ),
  ]);
  return {
    date: parsed.deliveryDate,
    orders: parsed.customers.map((c, i) => ({
      id: `o${i}`,
      customerKey: c.nameNormalized,
      items: c.lines.map((l) => ({
        productId: l.productId!,
        productName: l.productName!,
        variantId: l.variantId!,
        categoryCode: l.categoryCode,
        packSize: l.packSize!,
        qty: l.qty,
        subtotal: l.subtotal,
      })),
    })),
    products: new Map(PRODUCTS.map((p) => [p.name, { stockPcs: 0 }])),
    productRecipes: new Map(
      PRODUCTS.map((p) => [
        p.name,
        {
          recipeId: `r-${p.name}`,
          lines: p.lines.map(([ingredientId, qty]) => ({ ingredientId, qty })),
        },
      ]),
    ),
    semiRecipes: new Map(
      SEMI_FINISHED.map((r) => [
        r.name,
        {
          recipeId: `r-${r.name}`,
          yieldQty: r.yieldQty,
          lines: r.lines.map(([ingredientId, qty]) => ({ ingredientId, qty })),
        },
      ]),
    ),
    ingredients,
    packaging: new Map(
      VARIANTS.map(([n, c, pack]) => [
        `${n}|${c}|${pack}`,
        PACKAGING[c].map(([ingredientId, qty]) => ({ ingredientId, qty })),
      ]),
    ),
  };
}

describe('planProduction — contoh PRD 5.13 (12 pelanggan, stok awal 0)', () => {
  const plan = planProduction(seedInput());
  const pcs = Object.fromEntries(plan.products.map((p) => [p.productName, p.totalPcs]));
  const mat = Object.fromEntries(plan.materials.map((m) => [m.name, m.need]));

  it('138 pcs: Udang Keju 75, Dimsum Ori 39, Dimsum Keju 12, Dimsum Goreng Keju 12', () => {
    expect(plan.summary).toMatchObject({
      orders: 12,
      customers: 12,
      packs: 21,
      pcs: 138,
      amount: 510000,
    });
    expect(pcs).toEqual({
      'Udang Keju': 75,
      'Dimsum Ori': 39,
      'Dimsum Keju': 12,
      'Dimsum Goreng Keju': 12,
    });
    const udang = plan.products.find((p) => p.productName === 'Udang Keju')!;
    expect(udang.byVariant).toEqual({ 'FROZEN|6': 8, 'FROZEN|9': 2, 'SIAP_MAKAN|9': 1 });
  });

  it('adonan 3.540 g → 3 batch (3.600 g) → bahan mentah 3 batch', () => {
    expect(plan.semiFinished).toEqual([
      expect.objectContaining({
        name: 'Adonan Dasar',
        need: 3540,
        shortfall: 3540,
        batches: 3,
        willMake: 3600,
      }),
    ]);
    expect(mat).toMatchObject({
      Ayam: 3000,
      'Putih telur': 3,
      Gula: 99,
      'Bumbu adonan (paket)': 3,
      'Tepung tapioka': 360,
    });
  });

  it('keju oles 705 g, tepung roti 750 g, kulit dimsum 51, kulit lumpia 24', () => {
    expect(mat).toMatchObject({
      'Keju oles': 705,
      'Tepung roti': 750,
      'Kulit dimsum': 51,
      'Kulit lumpia': 24,
    });
  });

  it('kemasan: vacuum 18, stiker 18, saos 21, box 3, minyak & gas 3', () => {
    expect(mat).toMatchObject({
      'Plastik vacuum': 18,
      'Stiker logo': 18,
      Saos: 21,
      'Box siap makan': 3,
      'Minyak & gas': 3,
    });
  });

  it('daftar belanja: jumlah kemasan beli & estimasi dari harga beli terakhir', () => {
    const keju = plan.materials.find((m) => m.name === 'Keju oles')!;
    expect(keju).toMatchObject({ shortage: 705, packsToBuy: 1, estimatedCost: 140000 });
    const ayam = plan.materials.find((m) => m.name === 'Ayam')!;
    expect(ayam).toMatchObject({ packsToBuy: 3, estimatedCost: 180000 });
    expect(plan.shoppingTotal).toBe(plan.materials.reduce((s, m) => s + m.estimatedCost, 0));
  });

  it('daftar goreng hari kirim (Siap Makan)', () => {
    expect(plan.fryList).toEqual(
      expect.arrayContaining([
        { productName: 'Udang Keju', packSize: 9, qty: 1 },
        { productName: 'Dimsum Ori', packSize: 9, qty: 1 },
        { productName: 'Dimsum Goreng Keju', packSize: 6, qty: 1 },
      ]),
    );
  });

  it('stok produk & adonan yang ada mengurangi kebutuhan', () => {
    const input = seedInput();
    input.products.set('Udang Keju', { stockPcs: 75 });
    input.ingredients.set('Adonan Dasar', {
      ...input.ingredients.get('Adonan Dasar')!,
      stockQty: 1200,
    });
    const p = planProduction(input);
    expect(p.products.find((x) => x.productName === 'Udang Keju')!.toProduce).toBe(0);
    // adonan tanpa Udang Keju: 1.053 + 300 + 312 = 1.665 g − stok 1.200 = 465 g → 1 batch
    expect(p.semiFinished[0]).toMatchObject({ need: 1665, shortfall: 465, batches: 1 });
  });
});
