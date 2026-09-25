/**
 * Revisi alur order: disetujui → Diproses → Selesai/Dikirim/Siap diambil, COD "belum dibayar"
 * sampai uang diterima, dan QRIS otomatis disetujui dari notifikasi DANA (MacroDroid).
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
    await p.order.deleteMany({ where: { publicToken: { in: created } } });
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

    // Diantar → Selesai = Dikirim; muncul di daftar selesai hari ini.
    const list = await staff.as(api().get('/api/v1/processing')).expect(200);
    expect(list.body.processing.map((o: { id: string }) => o.id)).toContain(order.id);
    await staff
      .as(api().patch(`/api/v1/orders/${order.id}/fulfillment`))
      .send({ status: 'DONE' })
      .expect(200);
    const done = await staff.as(api().get('/api/v1/processing')).expect(200);
    expect(done.body.done.map((o: { id: string }) => o.id)).toContain(order.id);
  });

  it('staff tidak bisa melihat pengaturan webhook; URL dibuat otomatis', async () => {
    await staff.as(api().get('/api/v1/payment-notifications/setup')).expect(403);
    const setup = await admin.as(api().get('/api/v1/payment-notifications/setup')).expect(200);
    webhookKey = setup.body.key;
    expect(webhookKey.length).toBeGreaterThanOrEqual(24);
    expect(setup.body.path).toBe(`/api/v1/public/payment-notifications/${webhookKey}`);
    await notify('Kamu menerima Rp1.000 e2e', 'kunci-salah-kunci-salah').expect(404);
  });

  it('notifikasi DANA uang masuk → order QRIS cocok otomatis Diproses', async () => {
    const order = await onlineOrder();
    const amount = order.total + order.uniqueCode!;
    const rupiah = new Intl.NumberFormat('id-ID').format(amount);

    // Uji coba (tanpa menyetujui) menemukan order yang cocok.
    const test = await admin
      .as(api().post('/api/v1/payment-notifications/test'))
      .send({ text: `Kamu menerima Rp${rupiah} dari e2e` })
      .expect(200);
    expect(test.body).toMatchObject({ amount, incoming: true, ignoreReason: null });
    expect(test.body.matches).toEqual([{ orderNo: order.orderNo, customerName: 'e2e Proses' }]);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PENDING',
    );

    // Uang keluar dengan nominal sama tidak boleh menyetujui order.
    const out = await notify(`Kamu berhasil membayar Rp${rupiah} ke Toko e2e`).expect(200);
    expect(out.body.result).toBe('IGNORED');

    const res = await notify(`Kamu menerima Rp${rupiah} dari SITI e2e`).expect(200);
    expect(res.body).toEqual({ ok: true, result: 'MATCHED' });
    const saved = await ctx.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { logs: true },
    });
    expect(saved).toMatchObject({
      status: 'PAID',
      fulfillmentStatus: 'PROCESSING',
      paidAmount: amount,
      approvedById: null,
    });
    expect(saved.paidAt).not.toBeNull();
    expect(saved.logs.find((l) => l.action === 'APPROVED')?.reason).toMatch(/QRIS otomatis/);
    const moves = await ctx.prisma.stockMovement.findMany({
      where: { refId: order.id, type: 'SALE' },
    });
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.userId === null)).toBe(true);

    // MacroDroid terpicu dua kali → duplikat diabaikan.
    const dup = await notify(`Kamu menerima Rp${rupiah} dari SITI e2e`).expect(200);
    expect(dup.body.result).toBe('IGNORED');

    const setup = await admin.as(api().get('/api/v1/payment-notifications/setup')).expect(200);
    const matched = setup.body.notifications.find(
      (n: { result: string; order: { id: string } | null }) =>
        n.result === 'MATCHED' && n.order?.id === order.id,
    );
    expect(matched).toMatchObject({ amount, app: 'DANA' });
  });

  it('nominal tanpa pasangan dicatat UNMATCHED; ganti kunci mematikan URL lama', async () => {
    const res = await notify('Kamu menerima Rp7.654.321 dari e2e').expect(200);
    expect(res.body.result).toBe('UNMATCHED');
    const old = webhookKey;
    const rotated = await admin
      .as(api().post('/api/v1/payment-notifications/rotate-key'))
      .expect(200);
    webhookKey = rotated.body.key;
    expect(webhookKey).not.toBe(old);
    await notify('Kamu menerima Rp1.000 e2e lama', old).expect(404);
  });
});
