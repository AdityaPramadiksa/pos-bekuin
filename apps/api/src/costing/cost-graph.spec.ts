import { INGREDIENTS, PACKAGING, PRODUCTS, SEMI_FINISHED, VARIANTS } from '../../prisma/seed-data';
import { type CostIngredient, CostGraph, type CostRecipe, packHpp, roundTo10 } from './cost-graph';

/** Bangun graf dari data seeder (PRD bagian 7), id = nama. */
function seedGraph() {
  const ingredients: CostIngredient[] = [
    ...INGREDIENTS.map(([name, type, , , purchaseQty, price]) => ({
      id: name,
      name,
      type,
      avgCostPerUnit: price / purchaseQty,
    })),
    ...SEMI_FINISHED.map((r) => ({
      id: r.name,
      name: r.name,
      type: 'SEMI_FINISHED' as const,
      avgCostPerUnit: 0,
    })),
  ];
  const recipes: CostRecipe[] = [
    ...SEMI_FINISHED.map((r) => ({
      id: `r-${r.name}`,
      name: r.name,
      type: 'SEMI_FINISHED' as const,
      yieldQty: r.yieldQty,
      outputIngredientId: r.name,
      productId: null,
      lines: r.lines.map(([ingredientId, qty]) => ({ ingredientId, qty })),
    })),
    ...PRODUCTS.map((p) => ({
      id: `r-${p.name}`,
      name: p.name,
      type: 'PRODUCT' as const,
      yieldQty: 1,
      outputIngredientId: null,
      productId: p.name,
      lines: p.lines.map(([ingredientId, qty]) => ({ ingredientId, qty })),
    })),
  ];
  return { ingredients, recipes, graph: new CostGraph(ingredients, recipes) };
}

describe('CostGraph (angka harus cocok dengan PRD 7.2, 7.3, 7.5)', () => {
  const { graph, ingredients, recipes } = seedGraph();

  it('7.2 resep setengah jadi', () => {
    const adonan = graph.breakdown(recipes.find((r) => r.name === 'Adonan Dasar')!);
    expect(adonan.total).toBe(71361);
    expect(graph.unitCost('Adonan Dasar').toNumber()).toBeCloseTo(59.4675, 4);
    const kulit = graph.breakdown(recipes.find((r) => r.name === 'Kulit Risol')!);
    expect(kulit.total).toBe(15800);
    expect(graph.unitCost('Kulit Risol').toNumber()).toBe(316);
  });

  it('7.3 HPP per pcs produk (dibulatkan Rp10)', () => {
    const expected: Record<string, [number, number]> = {
      'Dimsum Goreng Keju': [2726, 2730],
      'Udang Keju': [2157, 2160],
      'Risol Mayo': [1986, 1990],
      'Dimsum Keju': [1987, 1990],
      'Dimsum Ori': [1756, 1760],
    };
    for (const [product, [raw, rounded]] of Object.entries(expected)) {
      const cost = graph.productCostPerPcs(product)!;
      expect(Math.round(cost)).toBe(raw);
      expect(roundTo10(cost)).toBe(rounded);
    }
  });

  it('7.5 HPP & margin semua 16 varian', () => {
    const table: Record<string, number> = {
      'Udang Keju FROZEN 6': 16260,
      'Dimsum Goreng Keju FROZEN 6': 19680,
      'Udang Keju SIAP_MAKAN 6': 16960,
      'Udang Keju FROZEN 9': 22740,
      'Dimsum Ori FROZEN 6': 13860,
      'Dimsum Ori SIAP_MAKAN 6': 14560,
      'Dimsum Keju FROZEN 6': 15240,
      'Dimsum Keju SIAP_MAKAN 6': 15940,
      'Dimsum Goreng Keju SIAP_MAKAN 6': 20380,
      'Udang Keju SIAP_MAKAN 9': 23440,
      'Dimsum Ori FROZEN 9': 19140,
      'Dimsum Ori SIAP_MAKAN 9': 19840,
      'Dimsum Keju FROZEN 9': 21210,
      'Dimsum Keju SIAP_MAKAN 9': 21910,
      'Risol Mayo FROZEN 6': 15240,
      'Risol Mayo SIAP_MAKAN 6': 15940,
    };
    expect(VARIANTS).toHaveLength(16);
    for (const [product, category, pack] of VARIANTS) {
      const packaging = PACKAGING[category].reduce(
        (sum, [name, qty]) => sum + qty * graph.unitCost(name).toNumber(),
        0,
      );
      expect({
        v: `${product} ${category} ${pack}`,
        hpp: packHpp(graph.productCostPerPcs(product)!, pack, packaging),
      }).toEqual({
        v: `${product} ${category} ${pack}`,
        hpp: table[`${product} ${category} ${pack}`],
      });
    }
  });

  it('perubahan harga bahan langsung memperbarui HPP', () => {
    const mahal = ingredients.map((i) => (i.id === 'Ayam' ? { ...i, avgCostPerUnit: 70 } : i));
    const g = new CostGraph(mahal, recipes);
    // adonan naik 10.000/1.200 g = 8,33/g → Udang Keju (25 g) naik ± Rp208/pcs
    expect(g.productCostPerPcs('Udang Keju')! - graph.productCostPerPcs('Udang Keju')!).toBeCloseTo(
      208.33,
      1,
    );
  });

  it('menolak resep melingkar', () => {
    const extra: CostIngredient = {
      id: 'Saus X',
      name: 'Saus X',
      type: 'SEMI_FINISHED',
      avgCostPerUnit: 0,
    };
    const sausX: CostRecipe = {
      id: 'r-x',
      name: 'Saus X',
      type: 'SEMI_FINISHED',
      yieldQty: 1,
      outputIngredientId: 'Saus X',
      productId: null,
      lines: [{ ingredientId: 'Adonan Dasar', qty: 1 }],
    };
    // Adonan memakai Saus X, Saus X memakai Adonan → melingkar
    const adonan = recipes.find((r) => r.name === 'Adonan Dasar')!;
    const loop = { ...adonan, lines: [...adonan.lines, { ingredientId: 'Saus X', qty: 1 }] };
    expect(() =>
      CostGraph.assertNoCycle([...ingredients, extra], [...recipes, sausX], loop),
    ).toThrow(/melingkar/);
    expect(() => CostGraph.assertNoCycle([...ingredients, extra], recipes, sausX)).not.toThrow();
  });
});
