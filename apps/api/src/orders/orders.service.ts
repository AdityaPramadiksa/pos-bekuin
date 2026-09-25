import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type OrderSource, OrderStatus, type OrderType, Prisma } from '@prisma/client';
import { normalizeName, type OrderListResponse, type OrderView } from '@bekuin/shared';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { lockOpenCashSession } from '../cash-sessions/cash-sessions.service';
import { addDays, businessRange, dateOnly, todayKey } from '../common/dates';
import { CostingService } from '../costing/costing.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { StockService } from '../stock/stock.service';
import type { StockChange } from '../stock/stock-plan';
import type {
  ApproveOrderDto,
  CreateOrderDto,
  ListOrdersDto,
  UpdateOrderDto,
} from './dto/order.dto';
import { orderDetailInclude, orderInclude, toOrderEvent, toOrderView } from './order-mapper';
import { nextOrderNo } from './order-number';
import {
  pcsByProduct,
  type PricedItem,
  type PricedVariant,
  priceItems,
  type RequestedItem,
  settlePayment,
} from './order-pricing';

export interface CreateOrderInput {
  items: RequestedItem[];
  source: OrderSource;
  type?: OrderType;
  tableId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  note?: string | null;
  deliveryDate?: string;
  batchId?: string;
  createdById: string | null;
  /** Order dari pelanggan QR: hanya kategori yang tampil ke pelanggan. */
  customerFacing?: boolean;
  /** Lewati cek stok (dipakai import pre-order; approve tetap cek). */
  skipStockCheck?: boolean;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly realtime: RealtimeGateway,
    private readonly costing: CostingService,
    private readonly push: PushService,
  ) {}

  // ───────────────────────────── Baca ─────────────────────────────

  async list(query: ListOrdersDto, user: JwtPayload): Promise<OrderListResponse> {
    const where: Prisma.OrderWhereInput = {};
    const csv = (v?: string) =>
      v
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const statuses = csv(query.status);
    if (statuses?.length) where.status = { in: statuses as OrderStatus[] };
    const sources = csv(query.source);
    if (sources?.length) where.source = { in: sources as OrderSource[] };
    const fulfillment = csv(query.fulfillment);
    if (fulfillment?.length)
      where.fulfillmentStatus = { in: fulfillment as Prisma.EnumFulfillmentStatusFilter['in'] };
    if (query.paymentMethodId) where.paymentMethodId = query.paymentMethodId;

    if (user.role !== 'ADMIN' || query.mine)
      where.createdById = user.sub; // staff hanya melihat miliknya
    else if (query.createdById) where.createdById = query.createdById;

    if (query.from || query.to) {
      const field = query.dateField ?? 'created';
      if (field === 'delivery') {
        where.deliveryDate = {
          gte: dateOnly(query.from ?? query.to!),
          lte: dateOnly(query.to ?? query.from!),
        };
      } else {
        where[field === 'approved' ? 'approvedAt' : 'createdAt'] = businessRange(
          query.from,
          query.to,
        );
      }
    }
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { orderNo: { contains: q, mode: 'insensitive' } },
        { customerName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: query.sort === 'oldest' ? 'asc' : 'desc' },
        take: query.limit ?? 50,
        skip: query.offset ?? 0,
      }),
      this.prisma.order.count({ where }),
    ]);
    const isAdmin = user.role === 'ADMIN';
    return { items: rows.map((o) => toOrderView(o, isAdmin)), total };
  }

  async get(id: string, user: JwtPayload): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: orderDetailInclude,
    });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    this.assertCanAccess(order, user);
    return toOrderView(order, user.role === 'ADMIN');
  }

  // ───────────────────────────── Buat & ubah ─────────────────────────────

  async createFromStaff(dto: CreateOrderDto, user: JwtPayload): Promise<OrderView> {
    const id = await this.prisma.$transaction((tx) =>
      this.createInTx(tx, {
        ...dto,
        source: user.role === 'ADMIN' ? 'ADMIN' : 'POS',
        createdById: user.sub,
      }),
    );
    return this.afterWrite(id, user, 'order.created');
  }

  /** Dipakai POS, self-order QR (Sprint 3), dan import WhatsApp (Sprint 6). */
  async createInTx(tx: Tx, input: CreateOrderInput): Promise<string> {
    const today = todayKey();
    const deliveryKey = input.deliveryDate ?? today;
    if (deliveryKey < today)
      throw new BadRequestException('Tanggal kirim tidak boleh sebelum hari ini');
    if (deliveryKey > addDays(today, 60))
      throw new BadRequestException('Tanggal kirim maksimal 60 hari ke depan');

    const { items, subtotal } = priceItems(input.items, await this.loadVariants(tx, input.items), {
      customerFacing: input.customerFacing,
    });
    if (input.tableId) await this.assertTable(tx, input.tableId);
    if (!input.skipStockCheck && deliveryKey === today) await this.assertAvailable(tx, items);

    const type: OrderType =
      input.type ?? (deliveryKey > today ? 'PREORDER' : input.tableId ? 'DINE_IN' : 'TAKEAWAY');
    const customerId = await this.resolveCustomer(tx, input.customerName, input.customerPhone);

    const order = await tx.order.create({
      data: {
        orderNo: await nextOrderNo(tx),
        source: input.source,
        type,
        tableId: input.tableId ?? null,
        customerId,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        note: input.note ?? null,
        deliveryDate: dateOnly(deliveryKey),
        batchId: input.batchId,
        subtotal,
        total: subtotal,
        createdById: input.createdById,
        items: { create: items.map(toItemCreate) },
        logs: { create: { action: 'CREATED', toStatus: 'PENDING', userId: input.createdById } },
      },
      select: { id: true },
    });
    return order.id;
  }

  async update(id: string, dto: UpdateOrderDto, user: JwtPayload): Promise<OrderView> {
    await this.prisma.$transaction(async (tx) => {
      const order = await this.lockPending(tx, id, user);
      const data: Prisma.OrderUpdateInput = {};
      if (dto.customerName !== undefined || dto.customerPhone !== undefined) {
        const name = dto.customerName !== undefined ? dto.customerName : order.customerName;
        const phone = dto.customerPhone !== undefined ? dto.customerPhone : order.customerPhone;
        data.customerName = name;
        data.customerPhone = phone;
        const customerId = await this.resolveCustomer(tx, name, phone);
        data.customer = customerId ? { connect: { id: customerId } } : { disconnect: true };
      }
      if (dto.note !== undefined) data.note = dto.note;
      if (dto.type) data.type = dto.type;
      if (dto.tableId !== undefined) {
        if (dto.tableId) await this.assertTable(tx, dto.tableId);
        data.table = dto.tableId ? { connect: { id: dto.tableId } } : { disconnect: true };
      }
      const deliveryKey = dto.deliveryDate ?? order.deliveryDate.toISOString().slice(0, 10);
      if (dto.deliveryDate) {
        if (dto.deliveryDate < todayKey())
          throw new BadRequestException('Tanggal kirim tidak boleh sebelum hari ini');
        data.deliveryDate = dateOnly(dto.deliveryDate);
      }
      if (dto.items) {
        const { items, subtotal } = priceItems(dto.items, await this.loadVariants(tx, dto.items), {
          customerFacing: order.source === 'QR_TABLE',
        });
        if (deliveryKey === todayKey()) await this.assertAvailable(tx, items, id);
        await tx.orderItem.deleteMany({ where: { orderId: id } });
        await tx.orderItem.createMany({
          data: items.map((i) => ({ ...toItemCreate(i), orderId: id })),
        });
        data.subtotal = subtotal;
        data.discount = 0;
        data.total = subtotal;
      }
      await tx.order.update({ where: { id }, data });
      await tx.orderLog.create({ data: { orderId: id, action: 'EDITED', userId: user.sub } });
    });
    return this.afterWrite(id, user, 'order.updated');
  }

  async cancel(id: string, reason: string | undefined, user: JwtPayload): Promise<OrderView> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockPending(tx, id, user);
      await this.setStatus(
        tx,
        id,
        'PENDING',
        'CANCELLED',
        'CANCELLED',
        user.sub,
        reason || 'Dibatalkan',
      );
    });
    return this.afterWrite(id, user, 'order.updated');
  }

  async reject(id: string, reason: string, user: JwtPayload): Promise<OrderView> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockPending(tx, id, user);
      await this.setStatus(tx, id, 'PENDING', 'REJECTED', 'REJECTED', user.sub, reason);
    });
    return this.afterWrite(id, user, 'order.updated');
  }

  // ───────────────────────────── Approve ─────────────────────────────

  /** Satu transaksi: koreksi item → cek & potong stok → snapshot HPP → PAID. */
  async approve(id: string, dto: ApproveOrderDto, user: JwtPayload): Promise<OrderView> {
    await this.prisma.$transaction(async (tx) => {
      await this.lockPending(tx, id, user);
      await this.approveInTx(tx, id, dto, user.sub);
    });
    this.realtime.stockChanged();
    return this.afterWrite(id, user, 'order.updated');
  }

  async approveInTx(tx: Tx, id: string, dto: ApproveOrderDto, userId: string) {
    // 1. Koreksi qty oleh admin (0 = hapus item).
    for (const change of dto.items ?? []) {
      const item = await tx.orderItem.findFirst({ where: { id: change.id, orderId: id } });
      if (!item) throw new BadRequestException('Item order tidak ditemukan');
      if (change.qty === 0) await tx.orderItem.delete({ where: { id: item.id } });
      else if (change.qty !== item.qty) {
        await tx.orderItem.update({
          where: { id: item.id },
          data: { qty: change.qty, subtotal: change.qty * item.price },
        });
      }
    }
    const items = await tx.orderItem.findMany({
      where: { orderId: id },
      include: {
        variant: {
          include: {
            product: { select: { id: true, avgCostPerPcs: true } },
            packaging: { select: { ingredientId: true, qty: true } },
          },
        },
      },
    });
    if (items.length === 0) throw new BadRequestException('Order tidak punya item');

    // 2. Total & pembayaran.
    const subtotal = items.reduce((sum, i) => sum + i.qty * i.price, 0);
    const discount = dto.discount ?? 0;
    if (discount > subtotal) throw new BadRequestException('Diskon melebihi subtotal');
    const total = subtotal - discount;
    const method = await tx.paymentMethod.findUnique({ where: { id: dto.paymentMethodId } });
    if (!method?.isActive) throw new BadRequestException('Metode bayar tidak valid');
    const payment = settlePayment(total, method.type, dto.paidAmount);
    // Uang cash masuk laci → wajib ada shift kasir terbuka (PRD 5.14).
    let cashSessionId: string | null = null;
    if (method.type === 'CASH') {
      cashSessionId = await lockOpenCashSession(tx);
      if (!cashSessionId) {
        throw new BadRequestException(
          'Belum ada shift kasir yang terbuka. Buka shift dulu di menu Keuangan → Shift Kasir.',
        );
      }
    }

    // 3. Potong stok pcs produk + kemasan per pack.
    const settings = await tx.setting.findUnique({ where: { id: 'default' } });
    const block = settings?.blockApproveOnLowStock ?? true;
    const changes: StockChange[] = [];
    for (const [productId, pcs] of pcsByProduct(
      items.map((i) => ({ ...i, productId: i.variant.productId })),
    )) {
      changes.push({ itemType: 'PRODUCT', id: productId, qty: -pcs });
    }
    for (const item of items) {
      for (const pack of item.variant.packaging) {
        changes.push({
          itemType: 'INGREDIENT',
          id: pack.ingredientId,
          qty: pack.qty.mul(item.qty).neg(),
        });
      }
    }
    await this.stock.apply(
      tx,
      changes,
      { type: 'SALE', userId, refType: 'ORDER', refId: id },
      { allowNegativeProducts: !block, allowNegativeIngredients: !block },
    );

    // 4. Snapshot HPP per pack: biaya aktual per pcs (hasil produksi) atau HPP teoretis resep + kemasan.
    const graph = await this.costing.graph(tx);
    let hppTotal = 0;
    for (const item of items) {
      const hppPerPack = this.costing.hppPerPack(graph, {
        packSize: item.packSize,
        product: item.variant.product,
        packaging: item.variant.packaging,
      });
      hppTotal += hppPerPack * item.qty;
      await tx.orderItem.update({
        where: { id: item.id },
        data: { hppPerPack, subtotal: item.qty * item.price },
      });
    }

    // 5. Lunas + masuk antrian dapur.
    await tx.order.update({
      where: { id },
      data: {
        status: 'PAID',
        fulfillmentStatus: 'QUEUED',
        subtotal,
        discount,
        total,
        hppTotal,
        paymentMethodId: method.id,
        paidAmount: payment.paidAmount,
        changeAmount: payment.changeAmount,
        paymentRef: dto.paymentRef ?? null,
        approvedById: userId,
        approvedAt: new Date(),
        cashSessionId,
      },
    });
    await tx.orderLog.create({
      data: {
        orderId: id,
        action: 'APPROVED',
        fromStatus: 'PENDING',
        toStatus: 'PAID',
        userId,
        reason: method.name,
      },
    });
  }

  /** Tiap order diproses dalam transaksi sendiri; yang gagal tidak menggagalkan yang lain. */
  async bulkApprove(orderIds: string[], paymentMethodId: string, user: JwtPayload) {
    const results: {
      id: string;
      orderNo: string;
      ok: boolean;
      message: string | null;
      total: number;
    }[] = [];
    for (const id of [...new Set(orderIds)]) {
      const order = await this.prisma.order.findUnique({
        where: { id },
        select: { orderNo: true, total: true },
      });
      if (!order) {
        results.push({ id, orderNo: '-', ok: false, message: 'Order tidak ditemukan', total: 0 });
        continue;
      }
      try {
        await this.prisma.$transaction(async (tx) => {
          const locked = await this.lockPending(tx, id, user);
          await this.approveInTx(tx, id, { paymentMethodId, paidAmount: locked.total }, user.sub);
        });
        const view = await this.afterWrite(id, user, 'order.updated');
        results.push({ id, orderNo: view.orderNo, ok: true, message: null, total: view.total });
      } catch (error) {
        const message =
          error instanceof Error
            ? ((error as { response?: { message?: string } }).response?.message ?? error.message)
            : 'Gagal';
        results.push({
          id,
          orderNo: order.orderNo,
          ok: false,
          message: String(message),
          total: order.total,
        });
      }
    }
    this.realtime.stockChanged();
    return {
      results,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    };
  }

  /** Void order lunas: stok pcs & kemasan dikembalikan (VOID_RETURN); order tetap tercatat sebagai VOIDED. */
  async void(id: string, reason: string, user: JwtPayload): Promise<OrderView> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: { include: { variant: { include: { packaging: true } } } } },
      });
      if (!order) throw new NotFoundException('Order tidak ditemukan');
      if (order.status !== 'PAID')
        throw new BadRequestException('Hanya order lunas yang bisa di-void');

      const changes: StockChange[] = [];
      for (const [productId, pcs] of pcsByProduct(
        order.items.map((i) => ({ ...i, productId: i.variant.productId })),
      )) {
        changes.push({ itemType: 'PRODUCT', id: productId, qty: pcs });
      }
      for (const item of order.items) {
        for (const pack of item.variant.packaging) {
          changes.push({
            itemType: 'INGREDIENT',
            id: pack.ingredientId,
            qty: pack.qty.mul(item.qty),
          });
        }
      }
      await this.stock.apply(tx, changes, {
        type: 'VOID_RETURN',
        userId: user.sub,
        refType: 'ORDER',
        refId: id,
        note: reason,
      });
      await this.setStatus(tx, id, 'PAID', 'VOIDED', 'VOIDED', user.sub, reason);
    });
    this.realtime.stockChanged();
    return this.afterWrite(id, user, 'order.updated');
  }

  // ───────────────────────────── Bantuan ─────────────────────────────

  /** Muat ulang order, kirim event realtime, balikan view. */
  async afterWrite(id: string, user: JwtPayload | null, event: 'order.created' | 'order.updated') {
    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: orderDetailInclude,
    });
    const orderEvent = toOrderEvent(order);
    this.realtime.orderChanged(event, orderEvent);
    this.push.orderChanged(event, orderEvent, user?.sub ?? null);
    this.realtime.orderStatusForCustomer(order.publicToken, {
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
    });
    return toOrderView(order, user?.role === 'ADMIN');
  }

  private assertCanAccess(order: { createdById: string | null }, user: JwtPayload) {
    if (user.role !== 'ADMIN' && order.createdById !== user.sub) {
      throw new ForbiddenException('Order ini bukan milik Anda');
    }
  }

  /** Kunci baris order dan pastikan masih PENDING. */
  async lockPending(tx: Tx, id: string, user: JwtPayload | null) {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    if (user) this.assertCanAccess(order, user);
    if (order.status !== 'PENDING') {
      throw new BadRequestException(
        `Order sudah ${order.status === 'PAID' ? 'lunas' : 'tidak aktif'} (${order.status})`,
      );
    }
    return order;
  }

  async setStatus(
    tx: Tx,
    id: string,
    from: OrderStatus,
    to: OrderStatus,
    action: string,
    userId: string | null,
    reason?: string,
  ) {
    await tx.order.update({ where: { id }, data: { status: to, reason: reason ?? null } });
    await tx.orderLog.create({
      data: { orderId: id, action, fromStatus: from, toStatus: to, reason, userId },
    });
  }

  private async loadVariants(tx: Tx, items: RequestedItem[]): Promise<Map<string, PricedVariant>> {
    const variants = await tx.productVariant.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.variantId))] } },
      include: { product: true, category: true },
    });
    return new Map(
      variants.map((v) => [
        v.id,
        {
          id: v.id,
          productId: v.productId,
          productName: v.product.name,
          categoryCode: v.category.code,
          packSize: v.packSize,
          price: v.price,
          isActive: v.isActive,
          categoryActive: v.category.isActive,
          categoryCustomerVisible: v.category.isCustomerVisible,
          productActive: v.product.isActive,
          productAvailable: v.product.isAvailable,
        },
      ]),
    );
  }

  /** Stok tersedia = stok − order PENDING hari ini (kecuali order ini sendiri). */
  async assertAvailable(tx: Tx, items: PricedItem[], excludeOrderId?: string) {
    const settings = await tx.setting.findUnique({ where: { id: 'default' } });
    if (settings && !settings.blockApproveOnLowStock) return;

    const need = pcsByProduct(items);
    const products = await tx.product.findMany({
      where: { id: { in: [...need.keys()] } },
      select: { id: true, name: true, stockPcs: true },
    });
    const pending = await tx.$queryRaw<{ productId: string; pcs: number }[]>`
      SELECT v."productId" AS "productId", COALESCE(SUM(oi.qty * oi."packSize"), 0)::int AS pcs
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      JOIN product_variants v ON v.id = oi."variantId"
      WHERE o.status = 'PENDING' AND o."deliveryDate" <= ${todayKey()}::date
        AND o.id <> ${excludeOrderId ?? ''}
        AND v."productId" IN (${Prisma.join([...need.keys()])})
      GROUP BY v."productId"`;
    const reserved = new Map(pending.map((r) => [r.productId, r.pcs]));

    const short = products
      .map((p) => ({
        ...p,
        available: Math.max(0, p.stockPcs - (reserved.get(p.id) ?? 0)),
        need: need.get(p.id)!,
      }))
      .filter((p) => p.need > p.available);
    if (short.length) {
      throw new BadRequestException(
        'Stok tidak cukup: ' +
          short
            .map((p) => `${p.name} (butuh ${p.need} pcs, tersedia ${p.available} pcs)`)
            .join('; '),
      );
    }
  }

  private async assertTable(tx: Tx, tableId: string) {
    const table = await tx.diningTable.findUnique({ where: { id: tableId } });
    if (!table?.isActive) throw new BadRequestException('Meja tidak ditemukan atau nonaktif');
  }

  /** Pelanggan tersimpan otomatis (PRD 5.13); tanpa nama = tidak membuat data pelanggan. */
  async resolveCustomer(
    tx: Tx,
    name?: string | null,
    phone?: string | null,
  ): Promise<string | null> {
    if (!name) return null;
    const nameNormalized = normalizeName(name);
    const existing = phone
      ? await tx.customer.findFirst({ where: { phone, isActive: true } })
      : await tx.customer.findFirst({
          where: { nameNormalized, isActive: true },
          orderBy: { createdAt: 'asc' },
        });
    if (existing) {
      if (phone && !existing.phone)
        await tx.customer.update({ where: { id: existing.id }, data: { phone } });
      return existing.id;
    }
    const created = await tx.customer.create({
      data: { name, nameNormalized, phone: phone ?? null },
    });
    return created.id;
  }
}

function toItemCreate(i: PricedItem) {
  return {
    variantId: i.variantId,
    productName: i.productName,
    categoryCode: i.categoryCode,
    packSize: i.packSize,
    price: i.price,
    qty: i.qty,
    subtotal: i.subtotal,
    note: i.note,
  };
}
