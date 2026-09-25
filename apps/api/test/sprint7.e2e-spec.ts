/**
 * Sprint 7 (PRD 5.14–5.15): pengeluaran, shift kasir, laporan & export.
 * Laporan dibandingkan sebelum/sesudah (delta) karena DB lokal bisa berisi data lain.
 */
import { createTestContext } from './helpers';

describe('Sprint 7: keuangan & laporan (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let admin: Awaited<ReturnType<typeof ctx.user>>;
  let staff: Awaited<ReturnType<typeof ctx.user>>;
  let productId: string;
  let f6: string; // Frozen 6 pcs @20.000, biaya 2.000/pcs → HPP 12.000
  let cashId: string;
  let transferId: string;
  let categoryId: string;
  let shiftId: string;
  let parkedShift: string | null = null;
  const orderIds: string[] = [];
  const expenseIds: string[] = [];
  const categoryIds: string[] = [];

  const api = () => ctx.api();
  const today = () =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
  const report = async (type: string, query = '') =>
    (await admin.as(api().get(`/api/v1/reports/${type}?${query}`)).expect(200)).body;
  async function paidOrder(paymentMethodId: string, qty = 1) {
    const created = await staff
      .as(api().post('/api/v1/orders'))
      .send({ items: [{ variantId: f6, qty }] })
      .expect(201);
    orderIds.push(created.body.id);
    return admin
      .as(api().post(`/api/v1/orders/${created.body.id}/approve`))
      .send({ paymentMethodId, paidAmount: qty * 20000 });
  }
  async function expense(body: Record<string, unknown>) {
    const res = await admin
      .as(api().post('/api/v1/expenses'))
      .send({ date: today(), categoryId, paymentMethodId: cashId, ...body });
    if (res.status === 201) expenseIds.push(res.body.id);
    return res;
  }

  beforeAll(async () => {
    ctx = await createTestContext('s7');
    admin = await ctx.user('ADMIN');
    staff = await ctx.user('STAFF');
    const frozen = await ctx.prisma.salesCategory.findUniqueOrThrow({ where: { code: 'FROZEN' } });
    const product = await ctx.prisma.product.create({
      data: {
        name: `e2e Laporan ${ctx.suffix}`,
        avgCostPerPcs: 2000,
        stockPcs: 120,
        variants: { create: [{ categoryId: frozen.id, packSize: 6, price: 20000 }] },
      },
      include: { variants: true },
    });
    productId = product.id;
    f6 = product.variants[0].id;
    cashId = (await ctx.prisma.paymentMethod.findUniqueOrThrow({ where: { name: 'Cash' } })).id;
    transferId = (
      await ctx.prisma.paymentMethod.findFirstOrThrow({ where: { type: { not: 'CASH' } } })
    ).id;
    // Shift lokal yang sedang terbuka diparkir dulu agar skenario "belum ada shift" bisa diuji.
    const open = await ctx.prisma.cashSession.findFirst({ where: { status: 'OPEN' } });
    if (open) {
      parkedShift = open.id;
      await ctx.prisma.cashSession.update({ where: { id: open.id }, data: { status: 'CLOSED' } });
    }
  });

  afterAll(async () => {
    const p = ctx.prisma;
    await p.stockMovement.deleteMany({ where: { productId } });
    await p.order.deleteMany({ where: { id: { in: orderIds } } });
    await p.expense.deleteMany({ where: { id: { in: expenseIds } } });
    if (shiftId) await p.cashSession.deleteMany({ where: { id: shiftId } });
    await p.expenseCategory.deleteMany({ where: { id: { in: categoryIds } } });
    await p.productVariant.deleteMany({ where: { productId } });
    await p.product.delete({ where: { id: productId } });
    if (parkedShift) {
      await p.cashSession.update({ where: { id: parkedShift }, data: { status: 'OPEN' } });
    }
    await ctx.close();
  });

  it('kategori pengeluaran: bawaan seeder, tambah, nama ganda ditolak, staff dilarang', async () => {
    const list = await admin.as(api().get('/api/v1/expense-categories')).expect(200);
    expect(list.body.map((c: { name: string }) => c.name)).toEqual(
      expect.arrayContaining(['Sewa', 'Gaji', 'Lain-lain']),
    );
    const name = `e2e Parkir ${ctx.suffix}`;
    const created = await admin
      .as(api().post('/api/v1/expense-categories'))
      .send({ name })
      .expect(201);
    categoryId = created.body.id;
    categoryIds.push(categoryId);
    await admin.as(api().post('/api/v1/expense-categories')).send({ name }).expect(409);
    await staff.as(api().get('/api/v1/expense-categories')).expect(403);
    await staff.as(api().get('/api/v1/reports/sales')).expect(403);
  });

  it('approve cash tanpa shift terbuka ditolak; QRIS/transfer tetap bisa', async () => {
    const res = await paidOrder(cashId);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/shift/i);
    await paidOrder(transferId).then((r) => expect(r.status).toBe(200));
  });

  it('buka shift: hanya satu yang boleh terbuka', async () => {
    const opened = await admin
      .as(api().post('/api/v1/cash-sessions/open'))
      .send({ openingCash: 200000 })
      .expect(201);
    shiftId = opened.body.id;
    expect(opened.body).toMatchObject({ status: 'OPEN', openingCash: 200000 });
    await admin
      .as(api().post('/api/v1/cash-sessions/open'))
      .send({ openingCash: 100000 })
      .expect(409);
    await staff.as(api().post('/api/v1/cash-sessions/open')).send({ openingCash: 1 }).expect(403);
  });

  it('penjualan & pengeluaran cash tertaut ke shift → kas seharusnya', async () => {
    // Order PENDING pertama (ditolak karena belum ada shift) sekarang bisa di-approve cash.
    const approved = await admin
      .as(api().post(`/api/v1/orders/${orderIds[0]}/approve`))
      .send({ paymentMethodId: cashId, paidAmount: 20000 })
      .expect(200);
    expect(approved.body.status).toBe('PAID');
    await paidOrder(cashId, 2).then((r) => expect(r.status).toBe(200));

    const cashExpense = await expense({ amount: 15000, note: 'parkir' }).then((r) => r.body);
    expect(cashExpense).toMatchObject({ fromCashDrawer: true, cashSessionId: shiftId });
    const transferExpense = await expense({ amount: 50000, paymentMethodId: transferId }).then(
      (r) => r.body,
    );
    expect(transferExpense.cashSessionId).toBeNull();
    await expense({ amount: 0 }).then((r) => expect(r.status).toBe(400));

    const current = (await admin.as(api().get('/api/v1/cash-sessions/current')).expect(200)).body;
    expect(current.id).toBe(shiftId);
    expect(current.summary).toMatchObject({
      cashSales: 60000,
      cashExpenses: 15000,
      expectedCash: 245000, // 200.000 + 60.000 − 15.000
    });
  });

  it('tutup shift: selisih wajib dicatat, setelah tutup pengeluaran terkunci', async () => {
    await admin
      .as(api().post(`/api/v1/cash-sessions/${shiftId}/close`))
      .send({ countedCash: 240000 })
      .expect(400);
    const closed = await admin
      .as(api().post(`/api/v1/cash-sessions/${shiftId}/close`))
      .send({ countedCash: 240000, note: 'kembalian kurang' })
      .expect(200);
    expect(closed.body).toMatchObject({
      status: 'CLOSED',
      expectedCash: 245000,
      countedCash: 240000,
      difference: -5000,
    });
    await admin
      .as(api().post(`/api/v1/cash-sessions/${shiftId}/close`))
      .send({ countedCash: 1 })
      .expect(409);
    await admin
      .as(api().patch(`/api/v1/expenses/${expenseIds[0]}`))
      .send({ amount: 1000 })
      .expect(409);
    // Pengeluaran transfer (tidak tertaut shift) masih bisa diubah.
    await admin
      .as(api().patch(`/api/v1/expenses/${expenseIds[1]}`))
      .send({ amount: 45000 })
      .expect(200);
    const history = await report('shifts', `from=${today()}`);
    expect(history.sessions.map((s: { id: string }) => s.id)).toContain(shiftId);
  });

  it('laporan penjualan: void tidak masuk omzet, dihitung terpisah', async () => {
    const before = await report('sales');
    const res = await paidOrder(transferId, 3);
    expect(res.status).toBe(200);
    const mid = await report('sales');
    expect(mid.summary.netSales - before.summary.netSales).toBe(60000);
    expect(mid.summary.grossProfit - before.summary.grossProfit).toBe(60000 - 36000);

    await admin
      .as(api().post(`/api/v1/orders/${res.body.id}/void`))
      .send({ reason: 'uji void' })
      .expect(200);
    const after = await report('sales');
    expect(after.summary.netSales).toBe(before.summary.netSales);
    expect(after.excluded.voided.count - before.excluded.voided.count).toBe(1);
    expect(after.excluded.voided.amount - before.excluded.voided.amount).toBe(60000);
    expect(after.byDay).toHaveLength(1);
    expect(after.byHour).toHaveLength(24);
  });

  it('laba rugi: laba bersih = laba kotor − pengeluaran − waste', async () => {
    const before = await report('profit-loss');
    await admin
      .as(api().post('/api/v1/stock/adjust'))
      .send({
        itemType: 'PRODUCT',
        itemId: productId,
        mode: 'SUBTRACT',
        qty: 3,
        reason: 'WASTE',
        note: 'basi',
      })
      .expect(201);
    const after = await report('profit-loss');
    expect(after.total.waste - before.total.waste).toBe(6000); // 3 pcs × 2.000
    for (const r of [before.total, after.total, ...after.byMonth]) {
      expect(r.netProfit).toBe(r.grossProfit - r.expenses - r.waste);
      expect(r.grossProfit).toBe(r.netSales - r.hpp);
    }
    expect(after.total.expenses).toBeGreaterThanOrEqual(15000 + 45000);
  });

  it('laba per produk, terlaris, arus kas, mutasi stok, layanan QR, rekap harian', async () => {
    const pp = await report('product-profit');
    const mine = pp.byProduct.find((r: { productId: string }) => r.productId === productId);
    // Lunas: 1 (transfer) + 1 + 2 (cash) = 4 pack; yang di-void tidak dihitung.
    expect(mine).toMatchObject({ packs: 4, pcs: 24, revenue: 80000, hpp: 48000, profit: 32000 });
    const top = await report('top-products');
    expect(top.rows.some((r: { productId: string }) => r.productId === productId)).toBe(true);

    const cf = await report('cashflow');
    expect(cf.net).toBe(cf.inflow.total - cf.outflow.total);

    const sm = await report('stock-movements');
    const waste = sm.rows.find(
      (r: { itemId: string; type: string }) => r.itemId === productId && r.type === 'WASTE',
    );
    expect(waste).toMatchObject({ qty: -3, value: -6000 });

    const qr = await report('qr-service');
    expect(qr.avgMinutes).toHaveProperty('total');

    const closing = await report('daily-closing', `date=${today()}`);
    expect(closing.date).toBe(today());
    expect(closing.netProfit).toBe(
      closing.summary.grossProfit - closing.expenses.total - closing.waste,
    );
    expect(closing.shifts.some((s: { id: string }) => s.id === shiftId)).toBe(true);
  });

  it('export CSV & XLSX, validasi periode', async () => {
    const csv = await admin
      .as(api().get('/api/v1/reports/sales/export?format=csv'))
      .buffer(true)
      .expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toMatch(/bekuin-sales-.*\.csv/);
    expect(csv.text).toContain('Omzet bersih');

    const xlsx = await admin
      .as(api().get('/api/v1/reports/profit-loss/export?format=xlsx'))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK'); // arsip zip

    await admin.as(api().get('/api/v1/reports/nope')).expect(400);
    await admin.as(api().get('/api/v1/reports/sales?from=2026-09-10&to=2026-09-01')).expect(400);
    await admin.as(api().get('/api/v1/reports/sales/export?format=pdf')).expect(400);
  });

  it('dashboard: grafik 7 hari & status shift', async () => {
    const dash = await report('today');
    expect(dash.last7Days).toHaveLength(7);
    expect(dash.last7Days[6].date).toBe(today());
    expect(dash.cashSession).toBeNull();
  });
});
