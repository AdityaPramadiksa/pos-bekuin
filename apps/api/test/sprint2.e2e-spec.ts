/** Sprint 2: order POS → approve → stok & HPP (DB asli). */
import { createTestContext } from './helpers';

describe('Sprint 2: POS & approval (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let admin: Awaited<ReturnType<typeof ctx.user>>;
  let staff: Awaited<ReturnType<typeof ctx.user>>;
  let staff2: Awaited<ReturnType<typeof ctx.user>>;
  let productId: string;
  let packagingId: string;
  let f6: string; // Frozen 6 pcs @20.000
  let sm9: string; // Siap Makan 9 pcs @30.000
  let cashId: string;
  let qrisId: string;
  const orderIds: string[] = [];

  const api = () => ctx.api();
  const adjust = (itemType: 'PRODUCT' | 'INGREDIENT', itemId: string, mode: string, qty: number) =>
    admin
      .as(api().post('/api/v1/stock/adjust'))
      .send({ itemType, itemId, mode, qty, reason: 'MANUAL_ADJUST', note: 'uji e2e' });
  const stockOf = async () =>
    (await ctx.prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockPcs;
  async function createOrder(
    as: typeof staff,
    items: { variantId: string; qty: number }[],
    extra = {},
  ) {
    const res = await as.as(api().post('/api/v1/orders')).send({ items, ...extra });
    if (res.status === 201) orderIds.push(res.body.id);
    return res;
  }

  beforeAll(async () => {
    ctx = await createTestContext('s2');
    admin = await ctx.user('ADMIN');
    staff = await ctx.user('STAFF');
    staff2 = await ctx.user('STAFF', 'staff2');
    const [frozen, siapMakan] = await Promise.all([
      ctx.prisma.salesCategory.findUniqueOrThrow({ where: { code: 'FROZEN' } }),
      ctx.prisma.salesCategory.findUniqueOrThrow({ where: { code: 'SIAP_MAKAN' } }),
    ]);
    const pack = await ctx.prisma.ingredient.create({
      data: {
        name: `e2e Box ${ctx.suffix}`,
        type: 'PACKAGING',
        baseUnit: 'PCS',
        avgCostPerUnit: 1000,
      },
    });
    packagingId = pack.id;
    const product = await ctx.prisma.product.create({
      data: {
        name: `e2e Dimsum ${ctx.suffix}`,
        avgCostPerPcs: 2000,
        variants: {
          create: [
            { categoryId: frozen.id, packSize: 6, price: 20000 },
            {
              categoryId: siapMakan.id,
              packSize: 9,
              price: 30000,
              packaging: { create: { ingredientId: pack.id, qty: 1 } },
            },
          ],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    f6 = product.variants.find((v) => v.packSize === 6)!.id;
    sm9 = product.variants.find((v) => v.packSize === 9)!.id;
    cashId = (await ctx.prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'Cash' } })).id;
    qrisId = (await ctx.prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'QRIS' } })).id;
    await ctx.cashShift(admin.id);
    await adjust('PRODUCT', productId, 'SET', 30).expect(201);
    await adjust('INGREDIENT', packagingId, 'SET', 5).expect(201);
  });

  afterAll(async () => {
    const p = ctx.prisma;
    await p.stockMovement.deleteMany({
      where: { OR: [{ productId }, { ingredientId: packagingId }] },
    });
    await p.order.deleteMany({ where: { id: { in: orderIds } } });
    await p.customer.deleteMany({ where: { name: { startsWith: 'e2e' } } });
    await p.productVariant.deleteMany({ where: { productId } });
    await p.product.delete({ where: { id: productId } });
    await p.ingredient.delete({ where: { id: packagingId } });
    await ctx.close();
  });

  it('staff membuat order campuran Frozen + Siap Makan (harga dari server)', async () => {
    const res = await createOrder(
      staff,
      [
        { variantId: f6, qty: 2 },
        { variantId: sm9, qty: 1 },
      ],
      { customerName: 'e2e Bu Sari', price: 1 },
    );
    // properti asing (price) ditolak whitelist
    expect(res.status).toBe(400);

    const ok = await createOrder(
      staff,
      [
        { variantId: f6, qty: 2 },
        { variantId: sm9, qty: 1 },
      ],
      { customerName: 'e2e Bu Sari' },
    );
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({
      status: 'PENDING',
      source: 'POS',
      type: 'TAKEAWAY',
      subtotal: 70000,
      total: 70000,
    });
    expect(ok.body.orderNo).toMatch(/^BK-\d{8}-\d{4}$/);
    expect(ok.body.hppTotal).toBeNull(); // staff tidak melihat HPP
    expect(ok.body.customerId).toBeTruthy();
  });

  it('stok tersedia memperhitungkan order PENDING lain', async () => {
    // stok 30, sudah dipesan 21 → tersedia 9 < 12
    const res = await createOrder(staff, [{ variantId: f6, qty: 2 }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Stok tidak cukup/);
  });

  it('staff hanya melihat order miliknya dan tidak bisa approve', async () => {
    const [id] = orderIds;
    await staff2.as(api().get(`/api/v1/orders/${id}`)).expect(403);
    const list = await staff2.as(api().get('/api/v1/orders')).expect(200);
    expect(
      list.body.items.every((o: { createdBy: { id: string } }) => o.createdBy.id === staff2.id),
    ).toBe(true);
    await staff
      .as(api().post(`/api/v1/orders/${id}/approve`))
      .send({ paymentMethodId: cashId })
      .expect(403);
  });

  it('approve cash: kembalian, stok & kemasan terpotong, HPP tersimpan', async () => {
    const [id] = orderIds;
    await admin
      .as(api().post(`/api/v1/orders/${id}/approve`))
      .send({ paymentMethodId: cashId, paidAmount: 50000 })
      .expect(400);

    const res = await admin
      .as(api().post(`/api/v1/orders/${id}/approve`))
      .send({ paymentMethodId: cashId, paidAmount: 100000 })
      .expect(200);
    expect(res.body).toMatchObject({
      status: 'PAID',
      fulfillmentStatus: 'QUEUED',
      paidAmount: 100000,
      changeAmount: 30000,
    });
    // HPP: F6 = 6×2.000 = 12.000; SM9 = 9×2.000 + 1 box 1.000 = 19.000 → 2×12.000 + 19.000
    expect(res.body.hppTotal).toBe(43000);
    expect(await stockOf()).toBe(9);
    const pack = await ctx.prisma.ingredient.findUniqueOrThrow({ where: { id: packagingId } });
    expect(pack.stockQty.toNumber()).toBe(4);

    const movements = await ctx.prisma.stockMovement.findMany({ where: { refId: id } });
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.type === 'SALE' && m.refType === 'ORDER')).toBe(true);

    await admin
      .as(api().post(`/api/v1/orders/${id}/approve`))
      .send({ paymentMethodId: cashId, paidAmount: 100000 })
      .expect(400);
  });

  it('approve dengan koreksi item & diskon, QRIS dianggap pas', async () => {
    const created = await createOrder(staff, [{ variantId: f6, qty: 1 }]);
    const id = created.body.id;
    const itemId = created.body.items[0].id;
    await admin
      .as(api().post(`/api/v1/orders/${id}/approve`))
      .send({ paymentMethodId: qrisId, items: [{ id: itemId, qty: 0 }] })
      .expect(400);
    await admin
      .as(api().post(`/api/v1/orders/${id}/approve`))
      .send({ paymentMethodId: qrisId, discount: 999999 })
      .expect(400);
    const res = await admin
      .as(api().post(`/api/v1/orders/${id}/approve`))
      .send({ paymentMethodId: qrisId, discount: 2000 })
      .expect(200);
    expect(res.body).toMatchObject({
      subtotal: 20000,
      discount: 2000,
      total: 18000,
      paidAmount: 18000,
      changeAmount: 0,
    });
    expect(await stockOf()).toBe(3);
  });

  it('dua approve bersamaan tidak pernah membuat stok minus', async () => {
    await adjust('PRODUCT', productId, 'SET', 12).expect(201);
    const a = (await createOrder(staff, [{ variantId: f6, qty: 1 }])).body.id;
    const b = (await createOrder(staff, [{ variantId: f6, qty: 1 }])).body.id;
    await adjust('PRODUCT', productId, 'SET', 6).expect(201); // hanya cukup untuk satu order

    const results = await Promise.all(
      [a, b].map((id) =>
        admin.as(api().post(`/api/v1/orders/${id}/approve`)).send({ paymentMethodId: qrisId }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(results.find((r) => r.status === 400)!.body.message).toMatch(/Stok tidak cukup/);
    expect(await stockOf()).toBe(0);
  });

  it('reject wajib alasan; staff bisa batal order PENDING miliknya', async () => {
    await adjust('PRODUCT', productId, 'SET', 30).expect(201);
    const x = (await createOrder(staff, [{ variantId: f6, qty: 1 }])).body.id;
    const y = (await createOrder(staff, [{ variantId: f6, qty: 1 }])).body.id;
    await admin
      .as(api().post(`/api/v1/orders/${x}/reject`))
      .send({ reason: '' })
      .expect(400);
    const rejected = await admin
      .as(api().post(`/api/v1/orders/${x}/reject`))
      .send({ reason: 'Pelanggan batal' })
      .expect(200);
    expect(rejected.body).toMatchObject({ status: 'REJECTED', reason: 'Pelanggan batal' });
    await staff2
      .as(api().post(`/api/v1/orders/${y}/cancel`))
      .send({})
      .expect(403);
    const cancelled = await staff
      .as(api().post(`/api/v1/orders/${y}/cancel`))
      .send({})
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
    const detail = await admin.as(api().get(`/api/v1/orders/${y}`)).expect(200);
    expect(detail.body.logs.map((l: { action: string }) => l.action)).toEqual([
      'CREATED',
      'CANCELLED',
    ]);
  });

  it('staff mengedit order PENDING (harga dihitung ulang)', async () => {
    const id = (await createOrder(staff, [{ variantId: f6, qty: 1 }])).body.id;
    const res = await staff
      .as(api().patch(`/api/v1/orders/${id}`))
      .send({ items: [{ variantId: f6, qty: 3 }], note: 'tambah saos' })
      .expect(200);
    expect(res.body).toMatchObject({ subtotal: 60000, total: 60000, note: 'tambah saos' });
  });

  it('nomor order berurutan dan ringkasan hari ini tersedia', async () => {
    const orders = await ctx.prisma.order.findMany({
      where: { id: { in: orderIds } },
      orderBy: { createdAt: 'asc' },
    });
    const seq = orders.map((o) => Number(o.orderNo.slice(-4)));
    expect(new Set(seq).size).toBe(seq.length);
    expect([...seq].sort((a, b) => a - b)).toEqual(seq);

    const summary = await admin.as(api().get('/api/v1/reports/today')).expect(200);
    expect(summary.body.paid.count).toBeGreaterThanOrEqual(3);
    await staff.as(api().get('/api/v1/reports/today')).expect(403);
  });
});
