/**
 * Link order online: pelanggan tanpa meja pesan sendiri (ambil/antar), pilih tanggal kirim,
 * ongkir tetap + gratis ongkir, bayar QRIS/COD, batas pesanan menunggu per No. WA.
 */
import { UnpaidOrdersService } from '../src/orders/unpaid-orders.service';
import { createTestContext } from './helpers';

describe('Link order online (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let admin: Awaited<ReturnType<typeof ctx.user>>;
  let staff: Awaited<ReturnType<typeof ctx.user>>;
  let productId: string;
  let f6: string; // Frozen 6 pcs @25.000
  let token: string;
  let qrisId: string;
  let cashId: string;
  let originalSettings: Record<string, unknown>;
  let originalMethods: { id: string; showToCustomer: boolean; isActive: boolean }[];
  const created: string[] = []; // publicToken
  const api = () => ctx.api();
  const wita = (offset = 0) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(
      new Date(Date.now() + offset * 86_400_000),
    );
  const PHONE_A = '0812-1111-2222';
  const PHONE_B = '0813 3333 4444';

  const order = async (body: Record<string, unknown> = {}) => {
    const res = await api()
      .post('/api/v1/public/online-orders')
      .send({
        onlineToken: token,
        items: [{ variantId: f6, qty: 1 }],
        customerName: 'e2e Sinta',
        customerPhone: PHONE_A,
        deliveryMethod: 'DELIVERY',
        deliveryAddress: 'Jl. Uji Coba No. 1, dekat masjid',
        deliveryDate: wita(1),
        paymentMethodId: qrisId,
        ...body,
      });
    if (res.status === 201) created.push(res.body.publicToken);
    return res;
  };
  const settings = (data: Record<string, unknown>) =>
    ctx.prisma.setting.update({ where: { id: 'default' }, data });

  beforeAll(async () => {
    ctx = await createTestContext('onl');
    admin = await ctx.user('ADMIN');
    staff = await ctx.user('STAFF');
    const p = ctx.prisma;
    originalSettings = (await p.setting.findUniqueOrThrow({
      where: { id: 'default' },
    })) as unknown as Record<string, unknown>;
    await settings({
      isStoreOpen: false, // toko tutup: pesanan hanya bisa untuk besok dst.
      onlineOrderingEnabled: true,
      deliveryEnabled: true,
      deliveryFee: 10000,
      freeDeliveryMin: 60000,
      deliveryNote: 'Antar area kota',
      qrMaxOrderTotal: 1_000_000,
    });
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
    const product = await p.product.create({
      data: {
        name: `e2e Lumpia ${ctx.suffix}`,
        stockPcs: 200,
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
    await settings(rest);
    await ctx.close();
  });

  it('link online dibuat otomatis, hanya admin yang bisa menggantinya', async () => {
    const s = await admin.as(api().get('/api/v1/settings')).expect(200);
    expect(s.body.onlineOrderToken).toMatch(/^[\w-]{12}$/);
    token = s.body.onlineOrderToken;
    await staff.as(api().post('/api/v1/settings/online-link/rotate')).expect(403);
  });

  it('menu online: tanpa meja, toko tutup → paling cepat besok, info ongkir', async () => {
    const res = await api().get(`/api/v1/public/online/${token}/menu`).expect(200);
    expect(res.body.table).toBeNull();
    expect(res.body.store.isOpen).toBe(true); // tetap bisa pre-order
    expect(res.body.online).toMatchObject({
      acceptingToday: false,
      earliestDate: wita(1),
      latestDate: wita(14),
      deliveryEnabled: true,
      deliveryFee: 10000,
      freeDeliveryMin: 60000,
      deliveryNote: 'Antar area kota',
    });
    expect(res.body.products.some((p: { id: string }) => p.id === productId)).toBe(true);
    await api().get('/api/v1/public/online/token-salah/menu').expect(404);
  });

  it('validasi: No. WA wajib, alamat wajib bila diantar, tanggal sesuai jam buka', async () => {
    expect((await order({ customerPhone: undefined })).status).toBe(400);
    expect((await order({ deliveryAddress: null })).status).toBe(400);
    const today = await order({ deliveryDate: wita(0) });
    expect(today.status).toBe(400);
    expect(today.body.message).toMatch(/mulai besok/);
    expect((await order({ deliveryDate: wita(15) })).status).toBe(400);
  });

  let deliveryToken: string;

  it('diantar: ongkir tetap masuk total; gratis ongkir di atas batas; QRIS tanpa kode unik', async () => {
    const res = await order();
    expect(res.status).toBe(201);
    deliveryToken = res.body.publicToken;
    const saved = await ctx.prisma.order.findUniqueOrThrow({
      where: { publicToken: deliveryToken },
    });
    expect(saved).toMatchObject({
      source: 'ONLINE',
      type: 'PREORDER',
      tableId: null,
      customerPhone: '081211112222', // dinormalkan
      deliveryMethod: 'DELIVERY',
      deliveryAddress: 'Jl. Uji Coba No. 1, dekat masjid',
      subtotal: 25000,
      deliveryFee: 10000,
      total: 35000,
    });
    expect(saved.deliveryDate.toISOString().slice(0, 10)).toBe(wita(1));
    expect(saved.uniqueCode).toBeNull(); // v2.4: tanpa kode unik, bayar pas sesuai total

    const view = await api().get(`/api/v1/public/orders/${deliveryToken}`).expect(200);
    expect(view.body.delivery).toEqual({
      method: 'DELIVERY',
      address: 'Jl. Uji Coba No. 1, dekat masjid',
      fee: 10000,
      date: wita(1),
    });
    expect(view.body.payment.amount).toBe(35000);
    expect(view.body.canUploadProof).toBe(true); // QRIS wajib bukti bayar
    expect(view.body.tableName).toBeNull();

    const free = await order({ items: [{ variantId: f6, qty: 3 }] });
    expect(free.status).toBe(201);
    const freeSaved = await ctx.prisma.order.findUniqueOrThrow({
      where: { publicToken: free.body.publicToken },
    });
    expect(freeSaved).toMatchObject({ subtotal: 75000, deliveryFee: 0, total: 75000 });
  });

  it('ambil sendiri + COD: tanpa ongkir & alamat, bayar tunai saat ambil', async () => {
    const res = await order({
      customerPhone: PHONE_B,
      deliveryMethod: 'PICKUP',
      deliveryAddress: 'diabaikan karena ambil sendiri',
      paymentMethodId: cashId,
    });
    expect(res.status).toBe(201);
    const saved = await ctx.prisma.order.findUniqueOrThrow({
      where: { publicToken: res.body.publicToken },
    });
    expect(saved).toMatchObject({
      deliveryMethod: 'PICKUP',
      deliveryAddress: null,
      deliveryFee: 0,
      total: 25000,
      payAtCashier: true,
      uniqueCode: null,
    });
  });

  it('maksimal 3 pesanan menunggu per No. WA (format nomor apa pun)', async () => {
    expect((await order({ customerPhone: '+62 812 1111 2222' })).status).toBe(201); // ke-3 untuk nomor A
    const fourth = await order({ customerPhone: '6281211112222' });
    expect(fourth.status).toBe(400);
    expect(fourth.body.message).toMatch(/menunggu konfirmasi/);
  });

  it('layanan antar dimatikan → diantar ditolak', async () => {
    await settings({ deliveryEnabled: false });
    expect((await order({ customerPhone: '0819 0000 1111' })).status).toBe(400);
    await settings({ deliveryEnabled: true });
  });

  it('ganti link: link lama tidak berlaku; order online nonaktif ditolak', async () => {
    const old = token;
    const rotated = await admin.as(api().post('/api/v1/settings/online-link/rotate')).expect(200);
    token = rotated.body.onlineOrderToken;
    expect(token).not.toBe(old);
    await api().get(`/api/v1/public/online/${old}/menu`).expect(404);

    await settings({ onlineOrderingEnabled: false });
    const menu = await api().get(`/api/v1/public/online/${token}/menu`).expect(200);
    expect(menu.body.store.isOpen).toBe(false);
    expect((await order({ customerPhone: '0819 0000 2222' })).status).toBe(403);
    await settings({ onlineOrderingEnabled: true });
  });

  it('approve: pesanan online dikunci, total termasuk ongkir, QRIS wajib bukti bayar', async () => {
    const saved = await ctx.prisma.order.findUniqueOrThrow({
      where: { publicToken: deliveryToken },
      include: { items: true },
    });
    const approve = (body: Record<string, unknown>) =>
      admin.as(api().post(`/api/v1/orders/${saved.id}/approve`)).send(body);
    await approve({ items: [{ id: saved.items[0].id, qty: 2 }] }).expect(400);
    await approve({ discount: 5000 }).expect(400);
    // Belum ada bukti bayar → admin harus menyatakan sudah mengecek uang masuk.
    const noProof = await approve({}).expect(400);
    expect(noProof.body.message).toMatch(/belum mengunggah bukti bayar/);
    const ok = await approve({ confirmWithoutProof: true }).expect(200);
    expect(ok.body).toMatchObject({
      status: 'PAID',
      subtotal: 25000,
      deliveryFee: 10000,
      total: 35000,
      paidAmount: 35000,
      deliveryMethod: 'DELIVERY',
    });
    expect(ok.body.paymentMethod.type).toBe('QRIS');
  });

  it('riwayat pesanan: hanya token yang dimiliki pelanggan, terbaru di atas', async () => {
    const lookup = (tokens: unknown) => api().post('/api/v1/public/orders/lookup').send({ tokens });
    const res = await lookup([...created, 'token-ngasal-tidak-ada']).expect(200);
    expect(res.body.map((o: { publicToken: string }) => o.publicToken).sort()).toEqual(
      [...created].sort(),
    );
    const delivered = res.body.find(
      (o: { publicToken: string }) => o.publicToken === deliveryToken,
    );
    expect(delivered).toMatchObject({
      status: 'PAID',
      total: 35000,
      itemCount: 1,
      delivery: { method: 'DELIVERY', date: wita(1) },
    });
    expect(delivered.itemsSummary).toContain('isi 6 ×1');
    expect(delivered).not.toHaveProperty('customerPhone');
    const times = res.body.map((o: { createdAt: string }) => o.createdAt);
    expect(times).toEqual([...times].sort().reverse());
    await lookup([]).expect(400);
    await lookup(Array.from({ length: 51 }, (_, i) => `t${i}`)).expect(400);
  });

  it('pelanggan bisa ganti cara bayar sebelum kirim bukti; admin tidak bisa menggantinya', async () => {
    const res = await order({ customerPhone: '0819 5555 6666', paymentMethodId: qrisId });
    expect(res.status).toBe(201);
    const token: string = res.body.publicToken;
    const change = (paymentMethodId: string) =>
      api().post(`/api/v1/public/orders/${token}/payment-method`).send({ paymentMethodId });

    const view = (await api().get(`/api/v1/public/orders/${token}`).expect(200)).body;
    expect(view.paymentOptions.map((m: { id: string }) => m.id)).toEqual(
      expect.arrayContaining([qrisId, cashId]),
    );
    await change('metode-ngasal').expect(400);
    const toCash = await change(cashId).expect(200);
    expect(toCash.body.payment).toMatchObject({ type: 'CASH' });
    expect(toCash.body.payAtCashier).toBe(true);
    const back = await change(qrisId).expect(200);
    expect(back.body.payment.type).toBe('QRIS');
    expect(back.body.canUploadProof).toBe(true);

    // Admin tidak bisa mengganti cara bayar pilihan pelanggan saat approve.
    const saved = await ctx.prisma.order.findUniqueOrThrow({ where: { publicToken: token } });
    const override = await admin
      .as(api().post(`/api/v1/orders/${saved.id}/approve`))
      .send({ paymentMethodId: cashId, confirmWithoutProof: true, paidAmount: 50000 })
      .expect(400);
    expect(override.body.message).toMatch(/dipilih pelanggan/);

    // Setelah bukti bayar dikirim, cara bayar dikunci.
    await ctx.prisma.order.update({
      where: { id: saved.id },
      data: { paymentProofUrl: '/uploads/proof/uji.webp' },
    });
    const locked = await change(cashId).expect(400);
    expect(locked.body.message).toMatch(/Bukti bayar sudah dikirim/);
    const lockedView = (await api().get(`/api/v1/public/orders/${token}`).expect(200)).body;
    expect(lockedView.paymentOptions).toEqual([]);

    // Admin cukup approve tanpa memilih metode: tercatat QRIS pilihan pelanggan.
    const ok = await admin
      .as(api().post(`/api/v1/orders/${saved.id}/approve`))
      .send({})
      .expect(200);
    expect(ok.body.paymentMethod.id).toBe(qrisId);
    const logs = await ctx.prisma.orderLog.findMany({
      where: { orderId: saved.id, action: 'PAYMENT_METHOD_CHANGED' },
    });
    expect(logs).toHaveLength(2);
  });

  it('menu online menandai stok terbatas / habis hari ini tanpa angka persis', async () => {
    const menu = async () =>
      (await api().get(`/api/v1/public/online/${token}/menu`).expect(200)).body.products.find(
        (p: { id: string }) => p.id === productId,
      ).variants[0];
    const setStock = (stockPcs: number) =>
      ctx.prisma.product.update({ where: { id: productId }, data: { stockPcs } });
    await setStock(1000);
    expect(await menu()).toMatchObject({ available: true, stockLevel: 'OK' });
    await setStock(10);
    expect(await menu()).toMatchObject({ available: true, stockLevel: 'LIMITED' });
    // Habis hari ini: masih bisa dipesan untuk tanggal lain (pre-order).
    await setStock(0);
    const out = await menu();
    expect(out).toMatchObject({ available: true, stockLevel: 'SOLD_OUT' });
    expect(out).not.toHaveProperty('availablePcs');
    await ctx.prisma.product.update({ where: { id: productId }, data: { isAvailable: false } });
    expect(await menu()).toMatchObject({ available: false, stockLevel: 'SOLD_OUT' });
    await ctx.prisma.product.update({
      where: { id: productId },
      data: { isAvailable: true, stockPcs: 200 },
    });
  });

  it('pesanan QRIS tanpa bukti bayar dibatalkan otomatis setelah batas jam', async () => {
    await settings({ unpaidCancelHours: 24 });
    const make = async (phone: string, body: Record<string, unknown> = {}) => {
      const res = await order({ customerPhone: phone, ...body });
      expect(res.status).toBe(201);
      return ctx.prisma.order.findUniqueOrThrow({ where: { publicToken: res.body.publicToken } });
    };
    const expired = await make('0817 1000 0001');
    const withProof = await make('0817 1000 0002');
    const cod = await make('0817 1000 0003', { paymentMethodId: cashId });
    const fresh = await make('0817 1000 0004');

    const view = (await api().get(`/api/v1/public/orders/${expired.publicToken}`).expect(200)).body;
    expect(new Date(view.payDeadline).getTime() - expired.createdAt.getTime()).toBe(24 * 3_600_000);

    const old = new Date(Date.now() - 25 * 3_600_000);
    await ctx.prisma.order.updateMany({
      where: { id: { in: [expired.id, withProof.id, cod.id] } },
      data: { createdAt: old },
    });
    await ctx.prisma.order.update({
      where: { id: withProof.id },
      data: { paymentProofUrl: '/uploads/proof/uji.webp' },
    });

    const unpaid = ctx.app.get(UnpaidOrdersService);
    await settings({ unpaidCancelHours: 0 }); // 0 = tidak pernah batal otomatis
    expect(await unpaid.cancelExpired()).toBe(0);
    await settings({ unpaidCancelHours: 24 });
    expect(await unpaid.cancelExpired()).toBeGreaterThanOrEqual(1);

    const status = async (id: string) =>
      ctx.prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true, reason: true } });
    expect(await status(expired.id)).toMatchObject({
      status: 'CANCELLED',
      reason: 'Otomatis dibatalkan: belum ada bukti bayar dalam 24 jam',
    });
    expect((await status(withProof.id)).status).toBe('PENDING'); // sudah kirim bukti
    expect((await status(cod.id)).status).toBe('PENDING'); // COD menunggu toko
    expect((await status(fresh.id)).status).toBe('PENDING'); // belum lewat batas
    const cancelledView = (
      await api().get(`/api/v1/public/orders/${expired.publicToken}`).expect(200)
    ).body;
    expect(cancelledView).toMatchObject({ status: 'CANCELLED', payDeadline: null });
    expect(cancelledView.reason).toMatch(/belum ada bukti bayar/);
  });

  it('pelanggan bisa membatalkan pesanan online yang belum dibayar', async () => {
    const pickup = created[2];
    const res = await api().post(`/api/v1/public/orders/${pickup}/cancel`).expect(200);
    expect(res.body.status).toBe('CANCELLED');
  });
});
