/** Sprint 5: stok masuk, produksi, opname, void (DB asli). */
import { createTestContext } from './helpers';

describe('Sprint 5: stok lengkap (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let admin: Awaited<ReturnType<typeof ctx.user>>;
  const api = () => ctx.api();
  const ids = {
    ingredients: [] as string[],
    products: [] as string[],
    recipes: [] as string[],
    orders: [] as string[],
    opnames: [] as string[],
    purchases: [] as string[],
  };
  let tepung: string;
  let dough: string;
  let doughRecipe: string;
  let product: string;
  let productRecipe: string;
  let box: string;
  let variant: string;

  const post = (url: string, body: object) => admin.as(api().post(`/api/v1${url}`)).send(body);
  const ing = (id: string) => ctx.prisma.ingredient.findUniqueOrThrow({ where: { id } });
  const prod = (id: string) => ctx.prisma.product.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    ctx = await createTestContext('s5');
    admin = await ctx.user('ADMIN');
    tepung = (
      await post('/ingredients', {
        name: `e2e Tepung ${ctx.suffix}`,
        type: 'RAW',
        baseUnit: 'GRAM',
        purchaseQty: 2000,
        lastPrice: 20000,
      }).expect(201)
    ).body.id;
    box = (
      await post('/ingredients', {
        name: `e2e Box ${ctx.suffix}`,
        type: 'PACKAGING',
        baseUnit: 'PCS',
        purchaseQty: 1,
        lastPrice: 1000,
      }).expect(201)
    ).body.id;
    const d = await post('/recipes', {
      type: 'SEMI_FINISHED',
      name: `e2e Adonan ${ctx.suffix}`,
      yieldQty: 1000,
      yieldUnit: 'GRAM',
      lines: [{ ingredientId: tepung, qty: 800 }],
    }).expect(201);
    doughRecipe = d.body.id;
    dough = d.body.outputIngredientId;
    product = (await post('/products', { name: `e2e Bakpao ${ctx.suffix}` }).expect(201)).body.id;
    productRecipe = (
      await post('/recipes', {
        type: 'PRODUCT',
        productId: product,
        lines: [{ ingredientId: dough, qty: 25 }],
      }).expect(201)
    ).body.id;
    const frozen = await ctx.prisma.salesCategory.findUniqueOrThrow({ where: { code: 'FROZEN' } });
    const v = await post(`/products/${product}/variants`, {
      categoryId: frozen.id,
      packSize: 6,
      price: 15000,
    }).expect(201);
    variant = v.body.variants[0].id;
    await admin
      .as(api().put(`/api/v1/products/${product}/variants/${variant}/packaging`))
      .send({ items: [{ ingredientId: box, qty: 1 }] })
      .expect(200);
    ids.ingredients.push(tepung, box, dough);
    ids.products.push(product);
    ids.recipes.push(doughRecipe, productRecipe);
  });

  afterAll(async () => {
    const p = ctx.prisma;
    await p.stockMovement.deleteMany({
      where: {
        OR: [{ productId: { in: ids.products } }, { ingredientId: { in: ids.ingredients } }],
      },
    });
    await p.order.deleteMany({ where: { id: { in: ids.orders } } });
    await p.stockOpname.deleteMany({ where: { id: { in: ids.opnames } } });
    await p.production.deleteMany({ where: { recipeId: { in: ids.recipes } } });
    await p.purchase.deleteMany({ where: { id: { in: ids.purchases } } });
    await p.recipe.deleteMany({ where: { id: { in: ids.recipes } } });
    await p.productVariant.deleteMany({ where: { productId: { in: ids.products } } });
    await p.product.deleteMany({ where: { id: { in: ids.products } } });
    await p.ingredient.deleteMany({ where: { id: { in: ids.ingredients } } });
    await ctx.close();
  });

  it('PRD: preview produksi 60 pcs Udang Keju = adonan 1.500 g, keju oles 420 g, tepung roti 600 g', async () => {
    const recipe = await ctx.prisma.recipe.findFirstOrThrow({
      where: { product: { name: 'Udang Keju' } },
    });
    const res = await post('/productions/preview', { recipeId: recipe.id, batchQty: 60 }).expect(
      200,
    );
    const need = Object.fromEntries(
      res.body.needs.map((n: { name: string; need: number }) => [n.name, n.need]),
    );
    expect(need).toEqual({ 'Adonan Dasar': 1500, 'Keju oles': 420, 'Tepung roti': 600 });
    expect(res.body.expectedOutput).toBe(60);
  });

  it('stok masuk: konversi satuan & rata-rata tertimbang', async () => {
    // stok awal 2.000 g @10/g (dari harga), beli 2 pack @2 kg total 60.000 → 4.000 g @15
    await post('/stock/adjust', {
      itemType: 'INGREDIENT',
      itemId: tepung,
      mode: 'SET',
      qty: 2000,
      reason: 'MANUAL_ADJUST',
      note: 'uji e2e',
    }).expect(201);
    const res = await post('/purchases', {
      date: new Date().toISOString().slice(0, 10),
      supplier: 'e2e Toko',
      items: [{ ingredientId: tepung, packQty: 2, totalPrice: 60000 }],
    }).expect(201);
    ids.purchases.push(res.body.id);
    expect(res.body.items[0]).toMatchObject({ qtyBase: 4000, unitCost: 15 });
    expect(res.body.total).toBe(60000);
    const after = await ing(tepung);
    expect(after.stockQty.toNumber()).toBe(6000);
    expect(after.avgCostPerUnit.toNumber()).toBeCloseTo((2000 * 10 + 4000 * 15) / 6000, 4); // 13,3333
    expect(after.lastPrice).toBe(30000);
    await post('/purchases', {
      date: '2999-01-01',
      items: [{ ingredientId: tepung, packQty: 1, totalPrice: 1 }],
    }).expect(400);
    await post('/purchases', {
      date: '2026-01-01',
      items: [{ ingredientId: dough, packQty: 1, totalPrice: 1 }],
    }).expect(400);
  });

  it('produksi bertingkat: adonan (dengan yield variance) lalu produk', async () => {
    const tooMuch = await post('/productions/preview', {
      recipeId: doughRecipe,
      batchQty: 100,
    }).expect(200);
    expect(tooMuch.body.canProduce).toBe(false);
    await post('/productions', { recipeId: doughRecipe, batchQty: 100 }).expect(400);

    // 2 batch adonan: tepung −1.600 g, hasil teori 2.000 g, aktual 1.980 g
    const batch = await post('/productions', {
      recipeId: doughRecipe,
      batchQty: 2,
      actualOutput: 1980,
    }).expect(201);
    expect(batch.body).toMatchObject({
      expectedOutput: 2000,
      actualOutput: 1980,
      yieldVariance: -20,
    });
    const tepungCost = (await ing(tepung)).avgCostPerUnit.toNumber();
    expect(batch.body.totalCost).toBeCloseTo(1600 * tepungCost, 1);
    expect((await ing(tepung)).stockQty.toNumber()).toBe(4400);
    const doughRow = await ing(dough);
    expect(doughRow.stockQty.toNumber()).toBe(1980);
    expect(doughRow.avgCostPerUnit.toNumber()).toBeCloseTo((1600 * tepungCost) / 1980, 3);

    // 40 pcs produk: adonan −1.000 g, produk +40 pcs dengan biaya aktual per pcs
    const made = await post('/productions', { recipeId: productRecipe, batchQty: 40 }).expect(201);
    expect(made.body.lines).toEqual([expect.objectContaining({ qtyUsed: 1000 })]);
    expect((await ing(dough)).stockQty.toNumber()).toBe(980);
    const bakpao = await prod(product);
    expect(bakpao.stockPcs).toBe(40);
    expect(bakpao.avgCostPerPcs.toNumber()).toBeCloseTo(25 * doughRow.avgCostPerUnit.toNumber(), 2);
    await post('/productions', { recipeId: productRecipe, batchQty: 1.5 }).expect(400); // pcs harus bulat
  });

  it('approve memakai biaya aktual produksi; void mengembalikan stok & kemasan', async () => {
    await post('/stock/adjust', {
      itemType: 'INGREDIENT',
      itemId: box,
      mode: 'SET',
      qty: 5,
      reason: 'MANUAL_ADJUST',
      note: 'uji e2e',
    }).expect(201);
    const order = await post('/orders', { items: [{ variantId: variant, qty: 2 }] }).expect(201);
    ids.orders.push(order.body.id);
    const qris = await ctx.prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'QRIS' } });
    const paid = await post(`/orders/${order.body.id}/approve`, {
      paymentMethodId: qris.id,
    }).expect(200);
    const perPcs = (await prod(product)).avgCostPerPcs.toNumber();
    expect(paid.body.items[0].hppPerPack).toBe(Math.round(6 * perPcs + 1000));
    expect((await prod(product)).stockPcs).toBe(28);
    expect((await ing(box)).stockQty.toNumber()).toBe(3);

    await post(`/orders/${order.body.id}/void`, { reason: '' }).expect(400);
    const voided = await post(`/orders/${order.body.id}/void`, { reason: 'Salah input' }).expect(
      200,
    );
    expect(voided.body).toMatchObject({ status: 'VOIDED', reason: 'Salah input' });
    expect((await prod(product)).stockPcs).toBe(40);
    expect((await ing(box)).stockQty.toNumber()).toBe(5);
    const returns = await ctx.prisma.stockMovement.findMany({
      where: { refId: order.body.id, type: 'VOID_RETURN' },
    });
    expect(returns).toHaveLength(2);
    await post(`/orders/${order.body.id}/void`, { reason: 'Lagi' }).expect(400);
  });

  it('stok opname: draft → hitung fisik → final menyesuaikan stok', async () => {
    const draft = await post('/opnames', { scope: 'PRODUCT', note: 'e2e' }).expect(201);
    ids.opnames.push(draft.body.id);
    const item = draft.body.items.find((i: { itemId: string }) => i.itemId === product);
    expect(item).toMatchObject({ systemQty: 40, physicalQty: null });
    await admin
      .as(api().patch(`/api/v1/opnames/${draft.body.id}`))
      .send({ items: [{ id: item.id, physicalQty: 1.5 }] })
      .expect(400);
    const counted = await admin
      .as(api().patch(`/api/v1/opnames/${draft.body.id}`))
      .send({ items: [{ id: item.id, physicalQty: 37 }] })
      .expect(200);
    expect(counted.body.items.find((i: { id: string }) => i.id === item.id)).toMatchObject({
      physicalQty: 37,
      diffQty: -3,
    });
    expect((await prod(product)).stockPcs).toBe(40); // draft belum mengubah stok

    const final = await post(`/opnames/${draft.body.id}/finalize`, {}).expect(200);
    expect(final.body.status).toBe('FINALIZED');
    expect((await prod(product)).stockPcs).toBe(37);
    const mv = await ctx.prisma.stockMovement.findFirstOrThrow({
      where: { refId: draft.body.id, productId: product },
    });
    expect(mv).toMatchObject({ type: 'OPNAME_ADJUST' });
    expect(mv.qtyChange.toNumber()).toBe(-3);
    await post(`/opnames/${draft.body.id}/finalize`, {}).expect(400);
    await admin.as(api().delete(`/api/v1/opnames/${draft.body.id}`)).expect(400);
  });

  it('waste hanya boleh mengurangi stok', async () => {
    await post('/stock/adjust', {
      itemType: 'PRODUCT',
      itemId: product,
      mode: 'ADD',
      qty: 1,
      reason: 'WASTE',
      note: 'jatuh',
    }).expect(400);
    await post('/stock/adjust', {
      itemType: 'PRODUCT',
      itemId: product,
      mode: 'SUBTRACT',
      qty: 2,
      reason: 'WASTE',
      note: 'jatuh',
    }).expect(201);
    expect((await prod(product)).stockPcs).toBe(35);
  });
});
