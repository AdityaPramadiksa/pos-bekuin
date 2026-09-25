/**
 * Sprint 6 (PRD 5.12–5.13): tempel pesan WA → 12 order PENDING → rekap produksi → produksi
 * → approve massal → stok & HPP benar. Stok produk/bahan asli dikembalikan di afterAll.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createTestContext } from './helpers';

describe('Sprint 6: pre-order massal via WhatsApp (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let admin: Awaited<ReturnType<typeof ctx.user>>;
  let staff: Awaited<ReturnType<typeof ctx.user>>;
  const api = () => ctx.api();
  const sample = readFileSync(
    path.resolve(__dirname, '../../../docs/fixtures/wa-order-sample.txt'),
    'utf8',
  );
  let snapshot: {
    products: { id: string; stockPcs: number; avgCostPerPcs: unknown }[];
    ingredients: { id: string; stockQty: unknown; avgCostPerUnit: unknown }[];
  };
  let startedAt: Date;
  let batchId: string;
  let orderIds: string[] = [];
  let tomorrow: string;
  const existingCustomers = new Set<string>();
  // Order lain (mis. dari uji manual) dengan tanggal kirim besok diparkir dulu agar rekap tidak tercemar.
  let parked: { id: string; deliveryDate: Date }[] = [];

  beforeAll(async () => {
    ctx = await createTestContext('s6');
    admin = await ctx.user('ADMIN');
    staff = await ctx.user('STAFF');
    startedAt = new Date();
    snapshot = {
      products: await ctx.prisma.product.findMany({
        select: { id: true, stockPcs: true, avgCostPerPcs: true },
      }),
      ingredients: await ctx.prisma.ingredient.findMany({
        select: { id: true, stockQty: true, avgCostPerUnit: true },
      }),
    };
    for (const c of await ctx.prisma.customer.findMany({ select: { id: true } }))
      existingCustomers.add(c.id);
    tomorrow = (await staff.as(api().post('/api/v1/orders/import/preview')).send({ text: sample }))
      .body.deliveryDate;
    const tomorrowDate = new Date(`${tomorrow}T00:00:00Z`);
    parked = await ctx.prisma.order.findMany({
      where: { deliveryDate: tomorrowDate },
      select: { id: true, deliveryDate: true },
    });
    await ctx.prisma.order.updateMany({
      where: { id: { in: parked.map((o) => o.id) } },
      data: { deliveryDate: new Date('2099-12-31T00:00:00Z') },
    });
  });

  afterAll(async () => {
    const p = ctx.prisma;
    await p.stockMovement.deleteMany({
      where: { createdAt: { gte: startedAt }, user: { username: { endsWith: ctx.suffix } } },
    });
    await p.production.deleteMany({
      where: { createdAt: { gte: startedAt }, createdBy: { username: { endsWith: ctx.suffix } } },
    });
    await p.order.deleteMany({ where: { id: { in: orderIds } } });
    for (const o of parked)
      await p.order.update({ where: { id: o.id }, data: { deliveryDate: o.deliveryDate } });
    if (batchId) await p.orderBatch.delete({ where: { id: batchId } });
    await p.productAlias.deleteMany({ where: { alias: { startsWith: 'e2e' } } });
    const created = await p.customer.findMany({
      where: { createdAt: { gte: startedAt } },
      select: { id: true },
    });
    await p.customer.deleteMany({
      where: { id: { in: created.map((c) => c.id).filter((id) => !existingCustomers.has(id)) } },
    });
    for (const s of snapshot.products) {
      await p.product.update({
        where: { id: s.id },
        data: { stockPcs: s.stockPcs, avgCostPerPcs: s.avgCostPerPcs as never },
      });
    }
    for (const s of snapshot.ingredients) {
      await p.ingredient.update({
        where: { id: s.id },
        data: { stockQty: s.stockQty as never, avgCostPerUnit: s.avgCostPerUnit as never },
      });
    }
    await ctx.close();
  });

  it('preview: 12 pelanggan, 21 pack, Rp510.000, kirim besok, tanpa baris merah', async () => {
    const res = await staff
      .as(api().post('/api/v1/orders/import/preview'))
      .send({ text: sample })
      .expect(200);
    expect(res.body.totals).toEqual({ orders: 12, packs: 21, amount: 510000 });
    expect(res.body.hasErrors).toBe(false);
    expect(res.body.deliveryDate).toBe(tomorrow);
    const mahayuda = res.body.customers.find((c: { name: string }) => c.name === 'Mahayuda');
    expect(
      mahayuda.lines.every((l: { categoryCode: string }) => l.categoryCode === 'SIAP_MAKAN'),
    ).toBe(true);
    expect(res.body.customers.find((c: { name: string }) => c.name === 'Bu Ayu').merged).toBe(true);
  });

  it('simpan semua: 12 order PENDING pre-order dalam satu batch (tanpa cek stok)', async () => {
    const preview = (
      await staff.as(api().post('/api/v1/orders/import/preview')).send({ text: sample })
    ).body;
    const res = await staff
      .as(api().post('/api/v1/orders/import'))
      .send({
        rawText: sample,
        deliveryDate: preview.deliveryDate,
        customers: preview.customers.map(
          (c: { name: string; lines: { variantId: string; qty: number }[] }) => ({
            name: c.name,
            items: c.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
          }),
        ),
      })
      .expect(201);
    expect(res.body).toMatchObject({ orders: 12, packs: 21, amount: 510000 });
    batchId = res.body.batchId;
    const orders = await ctx.prisma.order.findMany({ where: { batchId } });
    orderIds = orders.map((o) => o.id);
    expect(
      orders.every(
        (o) => o.status === 'PENDING' && o.source === 'WA_IMPORT' && o.type === 'PREORDER',
      ),
    ).toBe(true);
    const batch = await ctx.prisma.orderBatch.findUniqueOrThrow({ where: { id: batchId } });
    expect(batch.rawText).toBe(sample);
  });

  it('rekap produksi besok: 138 pcs, adonan 3.540 g, kemasan sesuai PRD', async () => {
    const plan = (
      await admin.as(api().get(`/api/v1/reports/production-plan?date=${tomorrow}`)).expect(200)
    ).body;
    const ours = plan.summary;
    expect(ours).toMatchObject({ orders: 12, packs: 21, pcs: 138, amount: 510000 });
    const need = Object.fromEntries(
      plan.materials.map((m: { name: string; need: number }) => [m.name, m.need]),
    );
    expect(need).toMatchObject({
      'Plastik vacuum': 18,
      'Stiker logo': 18,
      Saos: 21,
      'Box siap makan': 3,
      'Minyak & gas': 3,
    });
    for (const p of plan.products)
      expect(p.toProduce).toBe(Math.max(0, p.totalPcs - Math.max(0, p.stockPcs)));
    const dash = (await admin.as(api().get('/api/v1/reports/today')).expect(200)).body;
    expect(dash.tomorrow).toMatchObject({
      date: tomorrow,
      orders: 12,
      packs: 21,
      pcs: 138,
      amount: 510000,
    });
  });

  it('produksi dari rekap (stok produk 0) lalu approve massal: semua berhasil, stok produk kembali 0', async () => {
    const adjust = (itemType: string, itemId: string, qty: number) =>
      admin
        .as(api().post('/api/v1/stock/adjust'))
        .send({ itemType, itemId, mode: 'SET', qty, reason: 'MANUAL_ADJUST', note: 'uji e2e' });
    // Stok produk & adonan 0, bahan & kemasan melimpah.
    for (const p of await ctx.prisma.product.findMany({ where: { isActive: true } })) {
      if (p.stockPcs !== 0) await adjust('PRODUCT', p.id, 0).expect(201);
    }
    for (const i of await ctx.prisma.ingredient.findMany({ where: { isActive: true } })) {
      const target = i.type === 'SEMI_FINISHED' ? 0 : 100000;
      if (i.stockQty.toNumber() !== target) await adjust('INGREDIENT', i.id, target).expect(201);
    }

    const plan = (
      await admin.as(api().get(`/api/v1/reports/production-plan?date=${tomorrow}`)).expect(200)
    ).body;
    expect(plan.semiFinished[0]).toMatchObject({ name: 'Adonan Dasar', need: 3540, batches: 3 });
    for (const s of plan.semiFinished) {
      await admin
        .as(api().post('/api/v1/productions'))
        .send({ recipeId: s.recipeId, batchQty: s.batches })
        .expect(201);
    }
    for (const p of plan.products.filter((x: { toProduce: number }) => x.toProduce > 0)) {
      await admin
        .as(api().post('/api/v1/productions'))
        .send({ recipeId: p.recipeId, batchQty: p.toProduce })
        .expect(201);
    }
    const adonan = await ctx.prisma.ingredient.findUniqueOrThrow({
      where: { name: 'Adonan Dasar' },
    });
    expect(adonan.stockQty.toNumber()).toBe(60); // 3.600 − 3.540

    const transfer = await ctx.prisma.paymentMethod.findUniqueOrThrow({
      where: { name: 'Transfer' },
    });
    await staff
      .as(api().post('/api/v1/orders/bulk-approve'))
      .send({ orderIds, paymentMethodId: transfer.id })
      .expect(403);
    const res = await admin
      .as(api().post('/api/v1/orders/bulk-approve'))
      .send({ orderIds, paymentMethodId: transfer.id })
      .expect(200);
    expect(res.body).toMatchObject({ succeeded: 12, failed: 0 });

    const udang = await ctx.prisma.product.findUniqueOrThrow({ where: { name: 'Udang Keju' } });
    expect(udang.stockPcs).toBe(0);
    const orders = await ctx.prisma.order.findMany({ where: { id: { in: orderIds } } });
    expect(orders.every((o) => o.status === 'PAID' && o.hppTotal > 0)).toBe(true);
    // HPP dari biaya produksi aktual: total HPP ≈ biaya bahan yang terpakai untuk 138 pcs + kemasan
    const hpp = orders.reduce((s, o) => s + o.hppTotal, 0);
    expect(hpp).toBeGreaterThan(300_000);
    expect(hpp).toBeLessThan(510_000);
  });

  it('approve massal: order yang gagal tidak menggagalkan yang lain', async () => {
    const qris = await ctx.prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'QRIS' } });
    const res = await admin
      .as(api().post('/api/v1/orders/bulk-approve'))
      .send({ orderIds: [orderIds[0], 'tidak-ada'], paymentMethodId: qris.id })
      .expect(200);
    expect(res.body).toMatchObject({ succeeded: 0, failed: 2 });
    expect(res.body.results[0].message).toMatch(/disetujui/);
  });

  it('packing: daftar per tanggal kirim & status packing', async () => {
    const list = (
      await admin.as(api().get(`/api/v1/orders/packing-list?date=${tomorrow}`)).expect(200)
    ).body;
    expect(list.items.filter((o: { batchId: string }) => o.batchId === batchId)).toHaveLength(12);
    await admin
      .as(api().patch(`/api/v1/orders/${orderIds[0]}/fulfillment`))
      .send({ status: 'DONE' })
      .expect(200);
  });

  it('pelanggan tersimpan otomatis, autocomplete, gabung pelanggan ganda', async () => {
    const suggest = (await staff.as(api().get('/api/v1/customers/suggest?q=mahay')).expect(200))
      .body;
    expect(suggest[0].name).toBe('Mahayuda');
    const extra = (
      await staff.as(api().post('/api/v1/customers')).send({ name: 'Ibu Tini' }).expect(201)
    ).body;
    const tini = (await admin.as(api().get('/api/v1/customers?q=bu tini')).expect(200)).body.find(
      (c: { name: string }) => c.name === 'Bu Tini',
    );
    await staff
      .as(api().post(`/api/v1/customers/${tini.id}/merge`))
      .send({ duplicateId: extra.id })
      .expect(403);
    const merged = (
      await admin
        .as(api().post(`/api/v1/customers/${tini.id}/merge`))
        .send({ duplicateId: extra.id })
        .expect(201)
    ).body;
    expect(merged.name).toBe('Bu Tini');
    const last = (await admin.as(api().get(`/api/v1/customers/${tini.id}/last-order`)).expect(200))
      .body;
    expect(last.items[0].productName).toBe('Dimsum Goreng Keju');
  });

  it('alias: staff boleh menambah dari preview, hanya admin yang menghapus', async () => {
    const udang = await ctx.prisma.product.findUniqueOrThrow({ where: { name: 'Udang Keju' } });
    const alias = (
      await staff
        .as(api().post('/api/v1/product-aliases'))
        .send({ alias: 'e2e Udng  Kju', productId: udang.id })
        .expect(201)
    ).body;
    expect(alias.alias).toBe('e2e udng kju');
    await staff
      .as(api().post('/api/v1/product-aliases'))
      .send({ alias: 'e2e udng kju', productId: udang.id })
      .expect(409);
    await staff.as(api().delete(`/api/v1/product-aliases/${alias.id}`)).expect(403);
    await admin.as(api().delete(`/api/v1/product-aliases/${alias.id}`)).expect(204);
  });
});
