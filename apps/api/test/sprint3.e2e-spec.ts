/** Sprint 3: self-order QR meja, lacak pesanan, antrian dapur (DB asli). */
import { createTestContext } from './helpers';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Sprint 3: self-order QR & dapur (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let admin: Awaited<ReturnType<typeof ctx.user>>;
  let staff: Awaited<ReturnType<typeof ctx.user>>;
  let tableId: string;
  let qrToken: string;
  let productId: string;
  let sm6: string; // Siap Makan 6 pcs @25.000 (tampil ke pelanggan)
  let hiddenVariant: string; // kategori tersembunyi
  let hiddenCategoryId: string;
  let qrisId: string;
  let transferId: string;
  let originalMethods: { id: string; showToCustomer: boolean }[];
  let originalSettings: Record<string, unknown>;
  const api = () => ctx.api();

  beforeAll(async () => {
    ctx = await createTestContext('s3');
    admin = await ctx.user('ADMIN');
    staff = await ctx.user('STAFF');
    const p = ctx.prisma;
    originalSettings = (await p.setting.findUniqueOrThrow({
      where: { id: 'default' },
    })) as unknown as Record<string, unknown>;
    await p.setting.update({
      where: { id: 'default' },
      data: {
        isStoreOpen: true,
        qrOrderingEnabled: true,
        openingHours: undefined,
        qrMaxOrderTotal: 200000,
      },
    });
    const siapMakan = await p.salesCategory.findUniqueOrThrow({ where: { code: 'SIAP_MAKAN' } });
    const hidden = await p.salesCategory.create({
      data: {
        code: `E2E_${ctx.suffix.toUpperCase()}`,
        name: 'e2e grosir',
        isCustomerVisible: false,
      },
    });
    hiddenCategoryId = hidden.id;
    const product = await p.product.create({
      data: {
        name: `e2e Siomay ${ctx.suffix}`,
        stockPcs: 120,
        variants: {
          create: [
            { categoryId: siapMakan.id, packSize: 6, price: 25000 },
            { categoryId: hidden.id, packSize: 6, price: 10000 },
          ],
        },
      },
      include: { variants: true },
    });
    productId = product.id;
    sm6 = product.variants.find((v) => v.categoryId === siapMakan.id)!.id;
    hiddenVariant = product.variants.find((v) => v.categoryId === hidden.id)!.id;
    const table = await admin
      .as(api().post('/api/v1/tables'))
      .send({ code: `E${ctx.suffix.slice(-6).toUpperCase()}`, name: 'Meja Uji' })
      .expect(201);
    tableId = table.body.id;
    qrToken = table.body.qrToken;
    expect(qrToken).toMatch(/^[\w-]{12}$/);
    qrisId = (await p.paymentMethod.findUniqueOrThrow({ where: { name: 'QRIS' } })).id;
    transferId = (await p.paymentMethod.findUniqueOrThrow({ where: { name: 'Transfer' } })).id;
    originalMethods = await p.paymentMethod.findMany({
      select: { id: true, showToCustomer: true },
    });
    // Pelanggan boleh memilih QRIS, tidak boleh Transfer.
    await p.paymentMethod.update({ where: { id: qrisId }, data: { showToCustomer: true } });
    await p.paymentMethod.update({ where: { id: transferId }, data: { showToCustomer: false } });
  });

  afterAll(async () => {
    const p = ctx.prisma;
    const orders = await p.order.findMany({ where: { tableId }, select: { id: true } });
    await p.stockMovement.deleteMany({ where: { productId } });
    await p.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await p.customer.deleteMany({ where: { name: { startsWith: 'e2e' } } });
    await p.productVariant.deleteMany({ where: { productId } });
    await p.product.delete({ where: { id: productId } });
    await p.salesCategory.delete({ where: { id: hiddenCategoryId } });
    await p.diningTable.delete({ where: { id: tableId } });
    const { id: _i, updatedAt: _u, ...rest } = originalSettings;
    await p.setting.update({ where: { id: 'default' }, data: rest as never });
    for (const m of originalMethods) {
      await p.paymentMethod.update({
        where: { id: m.id },
        data: { showToCustomer: m.showToCustomer },
      });
    }
    await ctx.close();
  });

  const order = (body: Record<string, unknown>) =>
    api()
      .post('/api/v1/public/orders')
      .send({
        qrToken,
        customerName: 'e2e Andi',
        type: 'DINE_IN',
        items: [{ variantId: sm6, qty: 1 }],
        paymentMethodId: qrisId,
        ...body,
      });

  it('menu publik: tanpa login, hanya kategori yang tampil ke pelanggan, tanpa stok angka', async () => {
    await api().get('/api/v1/public/tables/tidak-ada/menu').expect(404);
    const res = await api().get(`/api/v1/public/tables/${qrToken}/menu`).expect(200);
    expect(res.body.table).toMatchObject({ name: 'Meja Uji', isTakeaway: false });
    expect(res.body.store.isOpen).toBe(true);
    const product = res.body.products.find((p: { id: string }) => p.id === productId);
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]).toEqual({
      id: sm6,
      categoryId: expect.any(String),
      categoryCode: 'SIAP_MAKAN',
      packSize: 6,
      price: 25000,
      available: true,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/stockPcs|availablePcs|avgCost|hpp/i);
  });

  it('menolak varian tersembunyi, total di atas batas, dan harga dari klien', async () => {
    await order({ items: [{ variantId: hiddenVariant, qty: 1 }] }).expect(400);
    const tooBig = await order({ items: [{ variantId: sm6, qty: 9 }] }); // 225.000 > 200.000
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.message).toMatch(/batas/);
    await order({ items: [{ variantId: sm6, qty: 1, price: 1 }] }).expect(400);
    await order({ paymentMethodId: transferId }).expect(400); // tidak tampil ke pelanggan
  });

  let publicToken: string;

  it('membuat pesanan: balikan hanya nomor, token lacak, total', async () => {
    const res = await order({ customerPhone: '0812 3456 7890', note: 'pedas' }).expect(201);
    expect(Object.keys(res.body).sort()).toEqual(['orderNo', 'publicToken', 'total']);
    expect(res.body.total).toBe(25000);
    publicToken = res.body.publicToken;

    const view = await api().get(`/api/v1/public/orders/${publicToken}`).expect(200);
    expect(view.body).toMatchObject({
      status: 'PENDING',
      tableName: 'Meja Uji',
      canCancel: true,
      canUploadProof: true,
      hasPaymentProof: false,
    });
    expect(JSON.stringify(view.body)).not.toMatch(/"id"|hpp|createdBy|paymentProofUrl/);

    const saved = await ctx.prisma.order.findUniqueOrThrow({ where: { publicToken } });
    expect(saved).toMatchObject({
      source: 'QR_TABLE',
      type: 'DINE_IN',
      createdById: null,
      tableId,
    });
  });

  it('bukti bayar: diunggah pelanggan, lalu tidak bisa dibatalkan sendiri', async () => {
    await api()
      .post(`/api/v1/public/orders/${publicToken}/payment-proof`)
      .attach('file', Buffer.from('bukan gambar'), 'a.jpg')
      .expect(400);
    const res = await api()
      .post(`/api/v1/public/orders/${publicToken}/payment-proof`)
      .attach('file', PNG_1PX, 'bukti.png')
      .expect(200);
    expect(res.body).toMatchObject({ hasPaymentProof: true, canCancel: false });
    await api().post(`/api/v1/public/orders/${publicToken}/cancel`).expect(400);
  });

  it('admin approve QRIS → Diproses → Siap diambil (pelanggan melihatnya)', async () => {
    const saved = await ctx.prisma.order.findUniqueOrThrow({ where: { publicToken } });
    const approved = await admin
      .as(api().post(`/api/v1/orders/${saved.id}/approve`))
      .send({})
      .expect(200);
    expect(approved.body.paymentProofUrl).toMatch(/^\/uploads\/proof\//);
    // Cara bayar pilihan pelanggan (QRIS) dipakai; uang masuk = total + kode unik.
    expect(approved.body.paymentMethod.name).toBe('QRIS');
    expect(approved.body.paidAmount).toBe(25000 + saved.uniqueCode!);

    const ids = (
      body: { processing: { id: string }[]; done: { id: string }[] },
      k: 'processing' | 'done',
    ) => body[k].map((o) => o.id);
    const list = await staff.as(api().get('/api/v1/processing')).expect(200);
    expect(ids(list.body, 'processing')).toContain(saved.id);
    expect((await api().get(`/api/v1/public/orders/${publicToken}`)).body).toMatchObject({
      status: 'PAID',
      fulfillmentStatus: 'PROCESSING',
      isPaid: true,
    });

    const step = (status: string, as = staff) =>
      as.as(api().patch(`/api/v1/orders/${saved.id}/fulfillment`)).send({ status });
    await step('READY').expect(400); // status lama tidak berlaku lagi
    await step('DONE').expect(200);
    await step('PROCESSING').expect(403); // staff tidak boleh mundur

    const done = await api().get(`/api/v1/public/orders/${publicToken}`).expect(200);
    expect(done.body).toMatchObject({
      fulfillmentStatus: 'DONE',
      paymentMethodName: 'QRIS',
      canCancel: false,
    });
    expect(done.body.completedAt).toBeTruthy();
    const after = await staff.as(api().get('/api/v1/processing')).expect(200);
    expect(ids(after.body, 'processing')).not.toContain(saved.id);
    expect(ids(after.body, 'done')).toContain(saved.id);

    // Admin boleh mengembalikan ke Diproses (koreksi).
    await step('PROCESSING', admin).expect(200);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { publicToken } });
    expect(row).toMatchObject({ fulfillmentStatus: 'PROCESSING', completedAt: null });
  });

  it('maksimal 3 pesanan menunggu per meja, pelanggan bisa batal', async () => {
    const tokens: string[] = [];
    for (let i = 0; i < 3; i++) tokens.push((await order({}).expect(201)).body.publicToken);
    const fourth = await order({});
    expect(fourth.status).toBe(400);
    expect(fourth.body.message).toMatch(/menunggu konfirmasi/);
    const cancelled = await api().post(`/api/v1/public/orders/${tokens[0]}/cancel`).expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');
  });

  it('rate limit: percobaan ke-11 dalam 10 menit dari meja & IP yang sama ditolak', async () => {
    // Sejauh ini 9 percobaan (4 ditolak validasi + 1 + 3 sukses + 1 ditolak batas PENDING).
    await order({}).expect(201); // ke-10
    await order({}).expect(429); // ke-11
  });

  it('toko tutup menolak pesanan; ganti QR membuat QR lama tidak berlaku', async () => {
    await ctx.prisma.setting.update({ where: { id: 'default' }, data: { isStoreOpen: false } });
    const menu = await api().get(`/api/v1/public/tables/${qrToken}/menu`).expect(200);
    expect(menu.body.store).toMatchObject({ isOpen: false, closedReason: 'Toko sedang tutup.' });
    await ctx.prisma.setting.update({ where: { id: 'default' }, data: { isStoreOpen: true } });

    const rotated = await admin.as(api().post(`/api/v1/tables/${tableId}/rotate-qr`)).expect(200);
    expect(rotated.body.qrToken).not.toBe(qrToken);
    await api().get(`/api/v1/public/tables/${qrToken}/menu`).expect(404);
    await api().get(`/api/v1/public/tables/${rotated.body.qrToken}/menu`).expect(200);
    const staffTables = await staff.as(api().get('/api/v1/tables')).expect(200);
    expect(staffTables.body.every((t: { qrToken: string | null }) => t.qrToken === null)).toBe(
      true,
    );
  });
});
