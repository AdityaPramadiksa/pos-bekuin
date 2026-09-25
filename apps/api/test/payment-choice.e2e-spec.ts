/**
 * Revisi pembayaran pelanggan QR: pelanggan memilih cara bayar (QRIS/Cash), QRIS bernominal +
 * kode unik dari QRIS statis toko, order QR dikunci saat approval (tanpa ubah item/diskon).
 */
import { parseQris, qrisCrc16 } from '@bekuin/shared';
import { createTestContext } from './helpers';

const tlv = (id: string, v: string) => `${id}${String(v.length).padStart(2, '0')}${v}`;
const withCrc = (body: string) => body + '6304' + qrisCrc16(body + '6304');
const STATIC_QRIS = withCrc(
  tlv('00', '01') +
    tlv('01', '11') +
    tlv('26', tlv('00', 'ID.CO.DANA.WWW') + tlv('01', '936009150000000001')) +
    tlv('51', tlv('00', 'ID.CO.QRIS.WWW') + tlv('02', 'ID1026600000001')) +
    tlv('52', '5812') +
    tlv('53', '360') +
    tlv('58', 'ID') +
    tlv('59', 'BEKUIN UJI') +
    tlv('60', 'DENPASAR'),
);

describe('Pembayaran pilihan pelanggan & QRIS bernominal (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let admin: Awaited<ReturnType<typeof ctx.user>>;
  let staff: Awaited<ReturnType<typeof ctx.user>>;
  let productId: string;
  let sm6: string; // Siap Makan 6 pcs @25.000
  const tableIds: string[] = [];
  const tokens: string[] = [];
  let qrisId: string;
  let cashId: string;
  let transferId: string;
  let originalSettings: Record<string, unknown>;
  let originalMethods: { id: string; showToCustomer: boolean; isActive: boolean }[];
  const api = () => ctx.api();

  const order = (table: number, body: Record<string, unknown> = {}) =>
    api()
      .post('/api/v1/public/orders')
      .send({
        qrToken: tokens[table],
        customerName: 'e2e Rina',
        type: 'DINE_IN',
        items: [{ variantId: sm6, qty: 1 }],
        paymentMethodId: qrisId,
        ...body,
      });
  const view = async (publicToken: string) =>
    (await api().get(`/api/v1/public/orders/${publicToken}`).expect(200)).body;
  const byToken = (publicToken: string) =>
    ctx.prisma.order.findUniqueOrThrow({ where: { publicToken }, include: { items: true } });

  beforeAll(async () => {
    ctx = await createTestContext('pay');
    admin = await ctx.user('ADMIN');
    staff = await ctx.user('STAFF');
    const p = ctx.prisma;
    originalSettings = (await p.setting.findUniqueOrThrow({
      where: { id: 'default' },
    })) as unknown as Record<string, unknown>;
    await p.setting.update({
      where: { id: 'default' },
      data: { isStoreOpen: true, qrOrderingEnabled: true, openingHours: undefined },
    });
    originalMethods = await p.paymentMethod.findMany({
      select: { id: true, showToCustomer: true, isActive: true },
    });
    qrisId = (await p.paymentMethod.findUniqueOrThrow({ where: { name: 'QRIS' } })).id;
    cashId = (await p.paymentMethod.findUniqueOrThrow({ where: { name: 'Cash' } })).id;
    transferId = (await p.paymentMethod.findUniqueOrThrow({ where: { name: 'Transfer' } })).id;
    await p.paymentMethod.updateMany({
      where: { id: { in: [qrisId, cashId] } },
      data: { showToCustomer: true, isActive: true },
    });
    await p.paymentMethod.update({ where: { id: transferId }, data: { showToCustomer: false } });

    const siapMakan = await p.salesCategory.findUniqueOrThrow({ where: { code: 'SIAP_MAKAN' } });
    const product = await p.product.create({
      data: {
        name: `e2e Hakau ${ctx.suffix}`,
        stockPcs: 200,
        avgCostPerPcs: 2000,
        variants: { create: [{ categoryId: siapMakan.id, packSize: 6, price: 25000 }] },
      },
      include: { variants: true },
    });
    productId = product.id;
    sm6 = product.variants[0].id;
    for (const n of [1, 2, 3]) {
      const t = await admin
        .as(api().post('/api/v1/tables'))
        .send({ code: `P${n}${ctx.suffix.slice(-5).toUpperCase()}`, name: `Meja Bayar ${n}` })
        .expect(201);
      tableIds.push(t.body.id);
      tokens.push(t.body.qrToken);
    }
    await ctx.cashShift(admin.id);
  });

  afterAll(async () => {
    const p = ctx.prisma;
    const orders = await p.order.findMany({
      where: { OR: [{ tableId: { in: tableIds } }, { items: { some: { variantId: sm6 } } }] },
      select: { id: true },
    });
    await p.stockMovement.deleteMany({ where: { productId } });
    await p.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await p.customer.deleteMany({ where: { name: { startsWith: 'e2e' } } });
    await p.productVariant.deleteMany({ where: { productId } });
    await p.product.delete({ where: { id: productId } });
    await p.diningTable.deleteMany({ where: { id: { in: tableIds } } });
    for (const m of originalMethods) {
      await p.paymentMethod.update({
        where: { id: m.id },
        data: { showToCustomer: m.showToCustomer, isActive: m.isActive },
      });
    }
    const { id: _i, updatedAt: _u, ...rest } = originalSettings;
    await p.setting.update({ where: { id: 'default' }, data: rest as never });
    await ctx.close();
  });

  it('pengaturan QRIS: hanya QRIS statis yang valid yang disimpan', async () => {
    const put = (qrisPayload: string | null) =>
      admin.as(api().patch('/api/v1/settings')).send({ qrisPayload });
    await put('000201010211bukan-qris').expect(400);
    await put(STATIC_QRIS.slice(0, -4) + '0000').expect(400); // CRC salah
    const dynamic = withCrc(
      STATIC_QRIS.slice(0, -8).replace('010211', '010212') + tlv('54', '5000'),
    );
    const rejected = await put(dynamic).expect(400);
    expect(rejected.body.message).toMatch(/statis/);
    const saved = await put(`  ${STATIC_QRIS}\n`).expect(200);
    expect(saved.body.qrisPayload).toBe(STATIC_QRIS);
    await staff.as(api().patch('/api/v1/settings')).send({ qrisPayload: null }).expect(403);
  });

  it('menu pelanggan hanya menampilkan cara bayar yang diizinkan (QRIS & Cash)', async () => {
    const menu = await api().get(`/api/v1/public/tables/${tokens[0]}/menu`).expect(200);
    const types = menu.body.paymentMethods.map((m: { type: string }) => m.type);
    expect(types).toEqual(expect.arrayContaining(['QRIS', 'CASH']));
    expect(types).not.toContain('TRANSFER');
    expect(menu.body).not.toHaveProperty('qrPaymentMode');
  });

  it('pesan wajib memilih cara bayar yang diizinkan', async () => {
    await order(0, { paymentMethodId: undefined }).expect(400);
    await order(0, { paymentMethodId: transferId }).expect(400);
  });

  let qrisToken: string;
  let qrisCode: number;

  it('QRIS: kode unik 1–99, QR bernominal total + kode, bukti bayar opsional', async () => {
    qrisToken = (await order(0).expect(201)).body.publicToken;
    const saved = await byToken(qrisToken);
    qrisCode = saved.uniqueCode!;
    expect(qrisCode).toBeGreaterThanOrEqual(1);
    expect(qrisCode).toBeLessThanOrEqual(99);
    expect(saved).toMatchObject({ paymentMethodId: qrisId, payAtCashier: false });

    const v = await view(qrisToken);
    expect(v.payment).toMatchObject({
      type: 'QRIS',
      methodName: 'QRIS',
      amount: 25000 + qrisCode,
      uniqueCode: qrisCode,
    });
    const tags = parseQris(v.payment.qrisPayload);
    expect(tags.find((t) => t.id === '54')?.value).toBe(String(25000 + qrisCode));
    expect(tags.find((t) => t.id === '59')?.value).toBe('BEKUIN UJI');
    expect(v.canUploadProof).toBe(true);

    // Order QRIS lain dengan total sama mendapat nominal berbeda.
    const other = (await order(1).expect(201)).body.publicToken;
    const otherView = await view(other);
    expect(otherView.payment.amount).not.toBe(v.payment.amount);
  });

  it('Cash: bayar di kasir, tanpa kode unik & tanpa unggah bukti', async () => {
    const token = (await order(2, { paymentMethodId: cashId }).expect(201)).body.publicToken;
    const saved = await byToken(token);
    expect(saved).toMatchObject({ paymentMethodId: cashId, payAtCashier: true, uniqueCode: null });
    const v = await view(token);
    expect(v.payment).toMatchObject({ type: 'CASH', amount: 25000, qrisPayload: null });
    expect(v.canUploadProof).toBe(false);

    // Admin approve tanpa memilih metode: Cash pilihan pelanggan, uang diterima wajib.
    await admin
      .as(api().post(`/api/v1/orders/${saved.id}/approve`))
      .send({})
      .expect(400);
    const approved = await admin
      .as(api().post(`/api/v1/orders/${saved.id}/approve`))
      .send({ paidAmount: 30000 })
      .expect(200);
    expect(approved.body).toMatchObject({ status: 'PAID', paidAmount: 30000, changeAmount: 5000 });
    expect(approved.body.paymentMethod.type).toBe('CASH');
  });

  it('order QR dikunci: item, jumlah, dan diskon tidak bisa diubah admin', async () => {
    const saved = await byToken(qrisToken);
    const itemId = saved.items[0].id;
    const approve = (body: Record<string, unknown>) =>
      admin.as(api().post(`/api/v1/orders/${saved.id}/approve`)).send(body);
    const changed = await approve({ items: [{ id: itemId, qty: 2 }] }).expect(400);
    expect(changed.body.message).toMatch(/tidak bisa diubah/);
    await approve({ items: [{ id: itemId, qty: 0 }] }).expect(400);
    await approve({ discount: 5000 }).expect(400);
    await admin
      .as(api().patch(`/api/v1/orders/${saved.id}`))
      .send({ items: [{ variantId: sm6, qty: 3 }] })
      .expect(400);

    // Mengirim item yang sama (tanpa perubahan) tetap boleh.
    const ok = await approve({ items: [{ id: itemId, qty: 1 }] }).expect(200);
    expect(ok.body).toMatchObject({ status: 'PAID', total: 25000, discount: 0 });
    expect(ok.body.paymentMethod.type).toBe('QRIS');
    expect(ok.body.paidAmount).toBe(25000 + qrisCode);
    expect(ok.body.uniqueCode).toBe(qrisCode);
  });

  it('order staff tetap bisa dikoreksi & admin wajib memilih metode bayar', async () => {
    const created = await staff
      .as(api().post('/api/v1/orders'))
      .send({ items: [{ variantId: sm6, qty: 2 }] })
      .expect(201);
    const id = created.body.id;
    const itemId = created.body.items[0].id;
    const noMethod = await admin.as(api().post(`/api/v1/orders/${id}/approve`)).send({});
    expect(noMethod.status).toBe(400);
    expect(noMethod.body.message).toMatch(/metode bayar/i);
    const approved = await admin
      .as(api().post(`/api/v1/orders/${id}/approve`))
      .send({ paymentMethodId: qrisId, items: [{ id: itemId, qty: 1 }], discount: 5000 })
      .expect(200);
    expect(approved.body).toMatchObject({ total: 20000, discount: 5000, uniqueCode: null });
    expect(approved.body.paidAmount).toBe(20000);
  });
});
