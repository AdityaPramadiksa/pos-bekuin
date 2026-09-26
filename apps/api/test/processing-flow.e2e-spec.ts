/**
 * Alur order: disetujui → Diproses → Selesai/Dikirim/Siap diambil (hanya admin; staff memantau
 * order miliknya), COD "belum dibayar" sampai uang diterima, dan notifikasi DANA (MacroDroid)
 * sebagai alat bantu cek bukti bayar (v2.4: tidak lagi menyetujui otomatis).
 */
import { createTestContext } from './helpers';

describe('Alur Diproses, COD, dan notifikasi QRIS (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let admin: Awaited<ReturnType<typeof ctx.user>>;
  let staff: Awaited<ReturnType<typeof ctx.user>>;
  let productId: string;
  let f6: string; // Frozen 6 pcs @25.000
  let token: string;
  let qrisId: string;
  let cashId: string;
  let webhookKey: string;
  let originalSettings: Record<string, unknown>;
  let originalMethods: { id: string; showToCustomer: boolean; isActive: boolean }[];
  const created: string[] = []; // publicToken
  const staffOrderIds: string[] = [];
  const api = () => ctx.api();
  const wita = (offset = 0) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(
      new Date(Date.now() + offset * 86_400_000),
    );
  let phoneSeq = 0;

  const onlineOrder = async (body: Record<string, unknown> = {}) => {
    phoneSeq += 1;
    const res = await api()
      .post('/api/v1/public/online-orders')
      .send({
        onlineToken: token,
        items: [{ variantId: f6, qty: 1 }],
        customerName: 'e2e Proses',
        customerPhone: `0857000${String(phoneSeq).padStart(5, '0')}`,
        deliveryMethod: 'DELIVERY',
        deliveryAddress: 'Jl. Proses No. 3',
        deliveryDate: wita(1),
        paymentMethodId: qrisId,
        ...body,
      });
    expect(res.status).toBe(201);
    created.push(res.body.publicToken);
    return ctx.prisma.order.findUniqueOrThrow({
      where: { publicToken: res.body.publicToken as string },
      include: { items: true },
    });
  };
  const notify = (text: string, key = webhookKey) =>
    api()
      .post(`/api/v1/public/payment-notifications/${key}`)
      .send({ app: 'DANA', title: 'DANA', text });

  beforeAll(async () => {
    ctx = await createTestContext('prc');
    admin = await ctx.user('ADMIN');
    staff = await ctx.user('STAFF');
    const p = ctx.prisma;
    originalSettings = (await p.setting.findUniqueOrThrow({
      where: { id: 'default' },
    })) as unknown as Record<string, unknown>;
    await p.setting.update({
      where: { id: 'default' },
      data: {
        isStoreOpen: false,
        onlineOrderingEnabled: true,
        deliveryEnabled: true,
        deliveryFee: 10000,
        freeDeliveryMin: 0,
        qrMaxOrderTotal: 1_000_000,
        blockApproveOnLowStock: true,
      },
    });
    token = (await admin.as(api().get('/api/v1/settings')).expect(200)).body.onlineOrderToken;
    originalMethods = await p.paymentMethod.findMany({
      select: { id: true, showToCustomer: true, isActive: true },
    });
    qrisId = (await p.paymentMethod.findUniqueOrThrow({ where: { name: 'QRIS' } })).id;
    cashId = (await p.paymentMethod.findUniqueOrThrow({ where: { name: 'Cash' } })).id;
    await p.paymentMethod.updateMany({
      where: { id: { in: [qrisId, cashId] } },
      data: { showToCustomer: true, isActive: true },
    });
    const frozen = await p.salesCategory.findUniqueOrThrow({ where: { code: 'FROZEN' } });
    // Stok hanya 6 pcs: pre-order besok tetap bisa disetujui (diproduksi sebelum dikirim).
    const product = await p.product.create({
      data: {
        name: `e2e Siomay ${ctx.suffix}`,
        stockPcs: 6,
        avgCostPerPcs: 2000,
        variants: { create: [{ categoryId: frozen.id, packSize: 6, price: 25000 }] },
      },
      include: { variants: true },
    });
    productId = product.id;
    f6 = product.variants[0].id;
    await ctx.cashShift(admin.id);
  });

  afterAll(async () => {
    const p = ctx.prisma;
    const orders = await p.order.findMany({
      where: { publicToken: { in: created } },
      select: { id: true },
    });
    await p.paymentNotification.deleteMany({
      where: { OR: [{ orderId: { in: orders.map((o) => o.id) } }, { text: { contains: 'e2e' } }] },
    });
    await p.stockMovement.deleteMany({ where: { productId } });
    await p.order.deleteMany({
      where: { OR: [{ publicToken: { in: created } }, { id: { in: staffOrderIds } }] },
    });
    await p.customer.deleteMany({ where: { name: { startsWith: 'e2e' } } });
    await p.productVariant.deleteMany({ where: { productId } });
    await p.product.delete({ where: { id: productId } });
    for (const m of originalMethods) {
      await p.paymentMethod.update({
        where: { id: m.id },
        data: { showToCustomer: m.showToCustomer, isActive: m.isActive },
      });
    }
    const { id: _i, updatedAt: _u, ...rest } = originalSettings;
    await p.setting.update({ where: { id: 'default' }, data: rest });
    await ctx.close();
  });

  it('COD: disetujui → Diproses tapi belum dibayar; lunas saat uang diterima', async () => {
    const order = await onlineOrder({
      paymentMethodId: cashId,
      items: [{ variantId: f6, qty: 2 }],
    });
    const approved = await admin
      .as(api().post(`/api/v1/orders/${order.id}/approve`))
      .send({ payLater: true })
      .expect(200);
    expect(approved.body).toMatchObject({
      status: 'PAID',
      fulfillmentStatus: 'PROCESSING',
      paidAt: null,
      paidAmount: null,
      total: 60000,
    });
    expect(approved.body.paymentMethod.name).toBe('Cash');
    // Stok 6 pcs, pesanan 12 pcs untuk besok → tetap disetujui, stok minus menunggu produksi.
    const product = await ctx.prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(product.stockPcs).toBe(-6);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.cashSessionId).toBeNull();
    const view = await api().get(`/api/v1/public/orders/${order.publicToken}`).expect(200);
    expect(view.body).toMatchObject({ fulfillmentStatus: 'PROCESSING', isPaid: false });

    const markPaid = (body: Record<string, unknown>, as = admin) =>
      as.as(api().post(`/api/v1/orders/${order.id}/mark-paid`)).send(body);
    await markPaid({ paidAmount: 60000 }, staff).expect(403);
    await markPaid({ paidAmount: 50000 }).expect(400); // uang kurang
    const paid = await markPaid({ paidAmount: 100000 }).expect(200);
    expect(paid.body).toMatchObject({ paidAmount: 100000, changeAmount: 40000 });
    expect(paid.body.paidAt).toBeTruthy();
    const after = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.cashSessionId).not.toBeNull(); // cash masuk shift yang terbuka
    await markPaid({ paidAmount: 100000 }).expect(400); // sudah lunas

    // Diantar → Selesai = Dikirim (hanya admin); muncul di daftar selesai hari ini.
    const list = await admin.as(api().get('/api/v1/processing')).expect(200);
    expect(list.body.processing.map((o: { id: string }) => o.id)).toContain(order.id);
    const fulfil = (as: typeof admin) =>
      as.as(api().patch(`/api/v1/orders/${order.id}/fulfillment`)).send({ status: 'DONE' });
    await fulfil(staff).expect(403);
    await fulfil(admin).expect(200);
    const done = await admin.as(api().get('/api/v1/processing')).expect(200);
    expect(done.body.done.map((o: { id: string }) => o.id)).toContain(order.id);
  });

  it('staff hanya memantau order yang dia input sendiri di Diproses', async () => {
    // Stok minus dari uji COD di atas; isi lagi supaya order hari ini bisa dibuat.
    await ctx.prisma.product.update({ where: { id: productId }, data: { stockPcs: 100 } });
    const mine = await staff
      .as(api().post('/api/v1/orders'))
      .send({ items: [{ variantId: f6, qty: 1 }], customerName: 'e2e Staff' })
      .expect(201);
    const byAdmin = await admin
      .as(api().post('/api/v1/orders'))
      .send({ items: [{ variantId: f6, qty: 1 }], customerName: 'e2e Admin' })
      .expect(201);
    staffOrderIds.push(mine.body.id, byAdmin.body.id);
    for (const id of [mine.body.id, byAdmin.body.id]) {
      await admin
        .as(api().post(`/api/v1/orders/${id}/approve`))
        .send({ paymentMethodId: qrisId })
        .expect(200);
    }
    const staffView = await staff.as(api().get('/api/v1/processing')).expect(200);
    const ids = staffView.body.processing.map((o: { id: string }) => o.id);
    expect(ids).toContain(mine.body.id);
    expect(ids).not.toContain(byAdmin.body.id);
    expect(
      staffView.body.processing.every(
        (o: { createdBy: { id: string } | null }) => o.createdBy?.id === staff.id,
      ),
    ).toBe(true);
    await staff
      .as(api().patch(`/api/v1/orders/${mine.body.id}/fulfillment`))
      .send({ status: 'DONE' })
      .expect(403);
  });

  it('staff tidak bisa melihat pengaturan webhook; URL dibuat otomatis', async () => {
    await staff.as(api().get('/api/v1/payment-notifications/setup')).expect(403);
    const setup = await admin.as(api().get('/api/v1/payment-notifications/setup')).expect(200);
    webhookKey = setup.body.key;
    expect(webhookKey.length).toBeGreaterThanOrEqual(24);
    expect(setup.body.path).toBe(`/api/v1/public/payment-notifications/${webhookKey}`);
    await notify('Kamu menerima Rp1.000 e2e', 'kunci-salah-kunci-salah').expect(404);
  });

  it('notifikasi DANA hanya dicatat & tampil sebagai pembanding bukti bayar saat approve', async () => {
    const order = await onlineOrder();
    const other = await onlineOrder(); // tagihan sama persis (35.000)
    expect(order.uniqueCode).toBeNull();
    const amount = order.total;
    const rupiah = new Intl.NumberFormat('id-ID').format(amount);

    // Uji coba teks: nominal terbaca & order menunggu dengan tagihan sama ditampilkan.
    const test = await admin
      .as(api().post('/api/v1/payment-notifications/test'))
      .send({ text: `Rp${rupiah} diterima DANA Bisnis.` })
      .expect(200);
    expect(test.body).toMatchObject({ amount, incoming: true, ignoreReason: null });
    expect(test.body.matches.map((m: { orderNo: string }) => m.orderNo)).toEqual(
      expect.arrayContaining([order.orderNo, other.orderNo]),
    );

    // Uang keluar diabaikan; uang masuk hanya dicatat — order tetap menunggu approve admin.
    const out = await notify(`Kamu berhasil membayar Rp${rupiah} ke Toko e2e`).expect(200);
    expect(out.body.result).toBe('IGNORED');
    const res = await notify(`Rp${rupiah} diterima DANA Bisnis. e2e-1`).expect(200);
    expect(res.body).toEqual({ ok: true, result: 'RECEIVED' });
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PENDING',
    );
    const dup = await notify(`Rp${rupiah} diterima DANA Bisnis. e2e-1`).expect(200);
    expect(dup.body.result).toBe('IGNORED'); // MacroDroid terpicu dua kali

    // Dialog approve: satu uang masuk yang cocok tampil untuk kedua order bertagihan sama.
    const forOrder = (id: string) =>
      admin.as(api().get(`/api/v1/payment-notifications/for-order/${id}`)).expect(200);
    await staff.as(api().get(`/api/v1/payment-notifications/for-order/${order.id}`)).expect(403);
    expect((await forOrder(order.id)).body).toHaveLength(1);
    expect((await forOrder(other.id)).body).toHaveLength(1);

    // Approve order pertama → notifikasi itu dipakai order ini, tidak bisa jadi "bukti" order lain.
    await admin
      .as(api().post(`/api/v1/orders/${order.id}/approve`))
      .send({ confirmWithoutProof: true })
      .expect(200);
    const used = (await forOrder(order.id)).body;
    expect(used).toHaveLength(1);
    expect(used[0]).toMatchObject({ result: 'MATCHED', order: { id: order.id } });
    expect((await forOrder(other.id)).body).toHaveLength(0);
  });

  it('ganti kunci mematikan URL webhook lama', async () => {
    const old = webhookKey;
    const rotated = await admin
      .as(api().post('/api/v1/payment-notifications/rotate-key'))
      .expect(200);
    webhookKey = rotated.body.key;
    expect(webhookKey).not.toBe(old);
    await notify('Kamu menerima Rp1.000 e2e lama', old).expect(404);
    const res = await notify('Kamu menerima Rp7.654.321 dari e2e baru').expect(200);
    expect(res.body.result).toBe('RECEIVED');
  });
});
