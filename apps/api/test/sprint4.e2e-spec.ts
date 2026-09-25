/** Sprint 4: bahan, resep bertingkat, HPP & margin, snapshot HPP (DB asli + data seeder). */
import { createTestContext } from './helpers';

describe('Sprint 4: bahan, resep, HPP (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let admin: Awaited<ReturnType<typeof ctx.user>>;
  let staff: Awaited<ReturnType<typeof ctx.user>>;
  const api = () => ctx.api();
  const created = {
    ingredients: [] as string[],
    products: [] as string[],
    recipes: [] as string[],
    orders: [] as string[],
  };

  beforeAll(async () => {
    ctx = await createTestContext('s4');
    admin = await ctx.user('ADMIN');
    staff = await ctx.user('STAFF');
  });

  afterAll(async () => {
    const p = ctx.prisma;
    await p.stockMovement.deleteMany({
      where: {
        OR: [
          { productId: { in: created.products } },
          { ingredientId: { in: created.ingredients } },
        ],
      },
    });
    await p.order.deleteMany({ where: { id: { in: created.orders } } });
    await p.recipe.deleteMany({ where: { id: { in: created.recipes } } });
    await p.productVariant.deleteMany({ where: { productId: { in: created.products } } });
    await p.product.deleteMany({ where: { id: { in: created.products } } });
    await p.ingredient.deleteMany({ where: { id: { in: created.ingredients } } });
    await ctx.close();
  });

  it('hanya admin yang bisa mengelola bahan & resep', async () => {
    await staff.as(api().get('/api/v1/ingredients')).expect(403);
    await staff.as(api().get('/api/v1/recipes')).expect(403);
  });

  it('HPP & margin varian seeder konsisten dengan resep + kemasan (angka persis PRD 7.5 dijaga unit test)', async () => {
    const res = await admin.as(api().get('/api/v1/products')).expect(200);
    const recipes = await admin.as(api().get('/api/v1/recipes')).expect(200);
    const udang = res.body.find((p: { name: string }) => p.name === 'Udang Keju');
    const recipe = recipes.body.find(
      (r: { productName: string }) => r.productName === 'Udang Keju',
    );
    // HPP per pcs = biaya resep saat ini (mengikuti harga bahan terbaru), dibulatkan Rp10
    expect(udang.costPerPcs).toBe(Math.round(recipe.costPerUnit / 10) * 10);
    const f6 = udang.variants.find(
      (v: { categoryCode: string; packSize: number }) =>
        v.categoryCode === 'FROZEN' && v.packSize === 6,
    );
    const packaging = f6.packaging.reduce(
      (sum: number, p: { qty: number; unitCost: number }) => sum + p.qty * p.unitCost,
      0,
    );
    expect(f6.hppPerPack).toBe(Math.round(6 * udang.costPerPcs + packaging));
    expect(f6.margin).toBe(f6.price - f6.hppPerPack);
    expect(f6.marginPct).toBe(Math.round((f6.margin * 100) / f6.price));
    expect(f6.packaging.map((p: { name: string }) => p.name).sort()).toEqual([
      'Plastik vacuum',
      'Saos',
      'Stiker logo',
    ]);
    const adonan = recipes.body.find((r: { name: string }) => r.name === 'Adonan Dasar');
    expect(adonan).toMatchObject({ type: 'SEMI_FINISHED', yieldQty: 1200, yieldUnit: 'GRAM' });
    expect(adonan.totalCost).toBeCloseTo(
      adonan.lines.reduce((sum: number, l: { cost: number }) => sum + l.cost, 0),
      0,
    );
  });

  let tepungId: string;
  let doughId: string;
  let doughRecipeId: string;
  let productId: string;
  let variantId: string;
  let boxId: string;

  it('membuat bahan, resep setengah jadi, dan resep produk bertingkat', async () => {
    const tepung = await admin
      .as(api().post('/api/v1/ingredients'))
      .send({
        name: `e2e Tepung ${ctx.suffix}`,
        type: 'RAW',
        baseUnit: 'GRAM',
        purchaseUnit: 'pack 1 kg',
        purchaseQty: 1000,
        lastPrice: 12000,
      })
      .expect(201);
    tepungId = tepung.body.id;
    created.ingredients.push(tepungId);
    expect(tepung.body.unitCost).toBe(12);

    const dough = await admin
      .as(api().post('/api/v1/recipes'))
      .send({
        type: 'SEMI_FINISHED',
        name: `e2e Adonan ${ctx.suffix}`,
        yieldQty: 500,
        yieldUnit: 'GRAM',
        lines: [{ ingredientId: tepungId, qty: 1000 }],
      })
      .expect(201);
    doughRecipeId = dough.body.id;
    doughId = dough.body.outputIngredientId;
    created.recipes.push(doughRecipeId);
    created.ingredients.push(doughId);
    expect(dough.body).toMatchObject({ totalCost: 12000, costPerUnit: 24 }); // 12.000 / 500 g

    const product = await admin
      .as(api().post('/api/v1/products'))
      .send({ name: `e2e Pangsit ${ctx.suffix}` })
      .expect(201);
    productId = product.body.id;
    created.products.push(productId);
    const frozen = await ctx.prisma.salesCategory.findUniqueOrThrow({ where: { code: 'FROZEN' } });
    const withVariant = await admin
      .as(api().post(`/api/v1/products/${productId}/variants`))
      .send({ categoryId: frozen.id, packSize: 10, price: 20000 })
      .expect(201);
    variantId = withVariant.body.variants[0].id;
    expect(withVariant.body.variants[0].hppPerPack).toBeNull(); // belum ada resep

    const recipe = await admin
      .as(api().post('/api/v1/recipes'))
      .send({ type: 'PRODUCT', productId, lines: [{ ingredientId: doughId, qty: 30 }] })
      .expect(201);
    created.recipes.push(recipe.body.id);
    expect(recipe.body.costPerUnit).toBe(720); // 30 g × 24

    // resep produk kedua untuk produk yang sama ditolak
    await admin
      .as(api().post('/api/v1/recipes'))
      .send({ type: 'PRODUCT', productId, lines: [{ ingredientId: doughId, qty: 1 }] })
      .expect(400);
  });

  it('kemasan per pack masuk HPP; bahan non-kemasan ditolak', async () => {
    const box = await admin
      .as(api().post('/api/v1/ingredients'))
      .send({
        name: `e2e Box ${ctx.suffix}`,
        type: 'PACKAGING',
        baseUnit: 'PCS',
        purchaseQty: 1,
        lastPrice: 1500,
      })
      .expect(201);
    boxId = box.body.id;
    created.ingredients.push(boxId);
    await admin
      .as(api().put(`/api/v1/products/${productId}/variants/${variantId}/packaging`))
      .send({ items: [{ ingredientId: tepungId, qty: 1 }] })
      .expect(400);
    const res = await admin
      .as(api().put(`/api/v1/products/${productId}/variants/${variantId}/packaging`))
      .send({ items: [{ ingredientId: boxId, qty: 1 }] })
      .expect(200);
    // 10 pcs × 720 + box 1.500 = 8.700 → margin 11.300 (57%)
    expect(res.body.variants[0]).toMatchObject({ hppPerPack: 8700, margin: 11300, marginPct: 57 });
  });

  it('harga bahan naik → HPP langsung naik', async () => {
    await admin
      .as(api().patch(`/api/v1/ingredients/${tepungId}`))
      .send({ lastPrice: 15000 })
      .expect(200);
    const res = await admin.as(api().get(`/api/v1/products/${productId}`)).expect(200);
    // adonan 15.000/500 = 30/g → 900/pcs → 10 × 900 + 1.500
    expect(res.body).toMatchObject({ costPerPcs: 900 });
    expect(res.body.variants[0].hppPerPack).toBe(10500);
    await admin
      .as(api().patch(`/api/v1/ingredients/${doughId}`))
      .send({ lastPrice: 1 })
      .expect(400); // setengah jadi dari resep
  });

  it('menolak resep melingkar dan bahan ganda', async () => {
    const other = await admin
      .as(api().post('/api/v1/recipes'))
      .send({
        type: 'SEMI_FINISHED',
        name: `e2e Isian ${ctx.suffix}`,
        yieldQty: 100,
        yieldUnit: 'GRAM',
        lines: [{ ingredientId: doughId, qty: 50 }],
      })
      .expect(201);
    created.recipes.push(other.body.id);
    created.ingredients.push(other.body.outputIngredientId);
    const loop = await admin.as(api().patch(`/api/v1/recipes/${doughRecipeId}`)).send({
      lines: [
        { ingredientId: tepungId, qty: 1000 },
        { ingredientId: other.body.outputIngredientId, qty: 10 },
      ],
    });
    expect(loop.status).toBe(400);
    expect(loop.body.message).toMatch(/melingkar/);
    await admin
      .as(api().patch(`/api/v1/recipes/${doughRecipeId}`))
      .send({
        lines: [
          { ingredientId: tepungId, qty: 1 },
          { ingredientId: tepungId, qty: 2 },
        ],
      })
      .expect(400);
  });

  it('approve menyimpan snapshot HPP teoretis bila belum ada biaya produksi', async () => {
    await admin
      .as(api().post('/api/v1/stock/adjust'))
      .send({
        itemType: 'PRODUCT',
        itemId: productId,
        mode: 'SET',
        qty: 50,
        reason: 'MANUAL_ADJUST',
        note: 'uji e2e',
      })
      .expect(201);
    await admin
      .as(api().post('/api/v1/stock/adjust'))
      .send({
        itemType: 'INGREDIENT',
        itemId: boxId,
        mode: 'SET',
        qty: 10,
        reason: 'MANUAL_ADJUST',
        note: 'uji e2e',
      })
      .expect(201);
    const order = await staff
      .as(api().post('/api/v1/orders'))
      .send({ items: [{ variantId, qty: 2 }] })
      .expect(201);
    created.orders.push(order.body.id);
    const qris = await ctx.prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'QRIS' } });
    const paid = await admin
      .as(api().post(`/api/v1/orders/${order.body.id}/approve`))
      .send({ paymentMethodId: qris.id })
      .expect(200);
    expect(paid.body.items[0].hppPerPack).toBe(10500);
    expect(paid.body.hppTotal).toBe(21000);

    // harga naik lagi setelah approve → snapshot order lama tidak berubah
    await admin
      .as(api().patch(`/api/v1/ingredients/${tepungId}`))
      .send({ lastPrice: 30000 })
      .expect(200);
    const again = await admin.as(api().get(`/api/v1/orders/${order.body.id}`)).expect(200);
    expect(again.body.hppTotal).toBe(21000);
  });
});
