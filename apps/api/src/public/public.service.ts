import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  calcDeliveryFee,
  isWithinOpeningHours,
  qrisWithAmount,
  type OpeningHours,
  type PublicMenuResponse,
  type PublicOrderCreated,
  type PublicOrderView,
} from '@bekuin/shared';
import type { DiningTable, PaymentType, Prisma, Setting } from '@prisma/client';
import { todayKey } from '../common/dates';
import { CatalogService } from '../menu/catalog.service';
import { orderInclude } from '../orders/order-mapper';
import { isCustomerSource } from '../orders/order-pricing';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UploadsService } from '../uploads/uploads.service';
import type { CreateOnlineOrderDto, CreatePublicOrderDto } from './dto/public-order.dto';
import { MAX_PENDING_PER_PHONE, normalizePhone, onlineDateWindow } from './online-order';
import { pickUniqueCode } from './unique-code';

export const MAX_PENDING_PER_TABLE = 3;
export const QR_ORDER_ATTEMPTS_PER_10_MIN = 10;
/** Kunci advisory saat memilih kode unik QRIS agar dua order tidak mendapat nominal sama. */
const UNIQUE_CODE_LOCK = 7_240_002;

function storeStatus(s: Setting | null): { isOpen: boolean; closedReason: string | null } {
  if (!s) return { isOpen: true, closedReason: null };
  if (!s.qrOrderingEnabled)
    return {
      isOpen: false,
      closedReason: 'Pesan lewat QR sedang tidak tersedia. Silakan pesan di kasir.',
    };
  if (!s.isStoreOpen) return { isOpen: false, closedReason: 'Toko sedang tutup.' };
  if (!isWithinOpeningHours(s.openingHours as OpeningHours | null)) {
    return { isOpen: false, closedReason: 'Di luar jam buka toko.' };
  }
  return { isOpen: true, closedReason: null };
}

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly orders: OrdersService,
    private readonly uploads: UploadsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Metode bayar yang aktif & ditandai "Tampil di QR pelanggan". */
  private customerPaymentMethods() {
    return this.prisma.paymentMethod.findMany({
      where: { isActive: true, showToCustomer: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, type: true },
    });
  }

  private async findTable(qrToken: string): Promise<DiningTable> {
    const table = await this.prisma.diningTable.findUnique({ where: { qrToken } });
    if (!table?.isActive) throw new NotFoundException('QR tidak valid. Silakan hubungi kasir.');
    return table;
  }

  async menu(qrToken: string): Promise<PublicMenuResponse> {
    const [table, settings, base] = await Promise.all([
      this.findTable(qrToken),
      this.prisma.setting.findUnique({ where: { id: 'default' } }),
      this.menuBase(),
    ]);
    return {
      store: {
        name: settings?.storeName ?? 'Bekuin',
        tagline: settings?.tagline ?? null,
        logoUrl: settings?.logoUrl ?? null,
        ...storeStatus(settings),
        openingHours: (settings?.openingHours as OpeningHours | null) ?? null,
      },
      table: { code: table.code, name: table.name, isTakeaway: table.code === 'TAKEAWAY' },
      online: null,
      maxOrderTotal: settings?.qrMaxOrderTotal ?? 1_000_000,
      ...base,
    };
  }

  /** Menu untuk link order online: selalu bisa pre-order, hari ini hanya saat toko buka. */
  async onlineMenu(onlineToken: string): Promise<PublicMenuResponse> {
    const [settings, base] = await Promise.all([this.onlineSettings(onlineToken), this.menuBase()]);
    const hours = (settings.openingHours as OpeningHours | null) ?? null;
    const openNow = settings.isStoreOpen && isWithinOpeningHours(hours);
    return {
      store: {
        name: settings.storeName,
        tagline: settings.tagline,
        logoUrl: settings.logoUrl,
        isOpen: settings.onlineOrderingEnabled,
        closedReason: settings.onlineOrderingEnabled
          ? null
          : 'Order online sedang tidak tersedia. Silakan hubungi kami lewat WhatsApp.',
        openingHours: hours,
      },
      table: null,
      online: {
        acceptingToday: openNow,
        ...onlineDateWindow(todayKey(), openNow),
        deliveryEnabled: settings.deliveryEnabled,
        deliveryFee: settings.deliveryFee,
        freeDeliveryMin: settings.freeDeliveryMin,
        deliveryNote: settings.deliveryNote,
        pickupAddress: settings.address,
      },
      maxOrderTotal: settings.qrMaxOrderTotal,
      ...base,
    };
  }

  /** Kategori, produk, dan cara bayar yang boleh dilihat pelanggan. */
  private async menuBase(): Promise<
    Pick<PublicMenuResponse, 'categories' | 'products' | 'paymentMethods'>
  > {
    const [catalog, categories, paymentMethods] = await Promise.all([
      this.catalog.get(),
      this.prisma.salesCategory.findMany({
        where: { isActive: true, isCustomerVisible: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, code: true, name: true },
      }),
      this.customerPaymentMethods(),
    ]);
    const visible = new Set(categories.map((c) => c.id));
    return {
      paymentMethods,
      categories,
      products: catalog.products
        .map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          variants: p.variants
            .filter((v) => visible.has(v.categoryId))
            .map((v) => ({
              id: v.id,
              categoryId: v.categoryId,
              categoryCode: v.categoryCode,
              packSize: v.packSize,
              price: v.price,
              available: p.isAvailable && p.availablePcs >= v.packSize,
            })),
        }))
        .filter((p) => p.variants.length > 0),
    };
  }

  async createOrder(dto: CreatePublicOrderDto): Promise<PublicOrderCreated> {
    const table = await this.findTable(dto.qrToken);
    const settings = await this.prisma.setting.findUnique({ where: { id: 'default' } });
    const status = storeStatus(settings);
    if (!status.isOpen) throw new ForbiddenException(status.closedReason);
    const method = (await this.customerPaymentMethods()).find((m) => m.id === dto.paymentMethodId);
    if (!method) throw new BadRequestException('Cara bayar ini tidak tersedia. Pilih yang lain.');

    const orderId = await this.prisma.$transaction(async (tx) => {
      // Kunci baris meja agar hitungan PENDING per meja tidak balapan.
      await tx.$queryRaw`SELECT id FROM dining_tables WHERE id = ${table.id} FOR UPDATE`;
      const pending = await tx.order.count({ where: { tableId: table.id, status: 'PENDING' } });
      if (pending >= MAX_PENDING_PER_TABLE) {
        throw new BadRequestException(
          'Masih ada pesanan yang menunggu konfirmasi di meja ini. Selesaikan pembayaran dulu atau hubungi kasir.',
        );
      }
      const id = await this.orders.createInTx(tx, {
        items: dto.items,
        source: 'QR_TABLE',
        type: table.code === 'TAKEAWAY' ? 'TAKEAWAY' : dto.type,
        tableId: table.id,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        note: dto.note,
        createdById: null,
        customerFacing: true,
      });
      const order = await tx.order.findUniqueOrThrow({ where: { id } });
      const max = settings?.qrMaxOrderTotal ?? 1_000_000;
      if (order.total > max) {
        throw new BadRequestException(
          `Total pesanan melebihi batas Rp${max.toLocaleString('id-ID')}. Silakan pesan di kasir.`,
        );
      }
      await this.assignPayment(tx, id, method, order.total);
      return id;
    });

    const order = await this.orders.afterWrite(orderId, null, 'order.created');
    return { orderNo: order.orderNo, publicToken: order.publicToken, total: order.total };
  }

  /** Pesanan lewat link order online: ambil/antar, tanggal kirim, ongkir tetap. */
  async createOnlineOrder(dto: CreateOnlineOrderDto): Promise<PublicOrderCreated> {
    const settings = await this.onlineSettings(dto.onlineToken);
    if (!settings.onlineOrderingEnabled) {
      throw new ForbiddenException('Order online sedang tidak tersedia.');
    }
    const openNow =
      settings.isStoreOpen &&
      isWithinOpeningHours((settings.openingHours as OpeningHours | null) ?? null);
    const { earliestDate, latestDate } = onlineDateWindow(todayKey(), openNow);
    if (dto.deliveryDate < earliestDate) {
      throw new BadRequestException(
        openNow
          ? 'Tanggal kirim tidak boleh sebelum hari ini'
          : 'Toko sedang tutup. Pilih tanggal mulai besok.',
      );
    }
    if (dto.deliveryDate > latestDate) {
      throw new BadRequestException('Tanggal kirim terlalu jauh, maksimal 14 hari ke depan');
    }
    const delivery = dto.deliveryMethod === 'DELIVERY';
    if (delivery && !settings.deliveryEnabled) {
      throw new BadRequestException('Layanan antar sedang tidak tersedia, pilih ambil sendiri');
    }
    const method = (await this.customerPaymentMethods()).find((m) => m.id === dto.paymentMethodId);
    if (!method) throw new BadRequestException('Cara bayar ini tidak tersedia. Pilih yang lain.');
    const phone = normalizePhone(dto.customerPhone);

    const orderId = await this.prisma.$transaction(async (tx) => {
      // Batas pesanan menunggu per No. WA (pengganti batas per meja), dikunci per nomor.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`online:${phone}`}))`;
      const pending = await tx.order.count({
        where: { source: 'ONLINE', status: 'PENDING', customerPhone: phone },
      });
      if (pending >= MAX_PENDING_PER_PHONE) {
        throw new BadRequestException(
          'Masih ada pesanan kamu yang menunggu konfirmasi. Selesaikan pembayarannya dulu ya.',
        );
      }
      const id = await this.orders.createInTx(tx, {
        items: dto.items,
        source: 'ONLINE',
        deliveryDate: dto.deliveryDate,
        customerName: dto.customerName,
        customerPhone: phone,
        note: dto.note,
        createdById: null,
        customerFacing: true,
      });
      const order = await tx.order.findUniqueOrThrow({ where: { id } });
      if (order.subtotal > settings.qrMaxOrderTotal) {
        throw new BadRequestException(
          `Total pesanan melebihi batas Rp${settings.qrMaxOrderTotal.toLocaleString('id-ID')}. Silakan hubungi kami lewat WhatsApp.`,
        );
      }
      const deliveryFee = delivery ? calcDeliveryFee(order.subtotal, settings) : 0;
      const total = order.total + deliveryFee;
      await tx.order.update({
        where: { id },
        data: {
          deliveryMethod: dto.deliveryMethod,
          deliveryAddress: delivery ? (dto.deliveryAddress ?? null) : null,
          deliveryFee,
          total,
        },
      });
      await this.assignPayment(tx, id, method, total);
      return id;
    });

    const order = await this.orders.afterWrite(orderId, null, 'order.created');
    return { orderNo: order.orderNo, publicToken: order.publicToken, total: order.total };
  }

  /** Pengaturan toko bila token link online cocok; 404 bila link salah/sudah diganti. */
  private async onlineSettings(onlineToken: string): Promise<Setting> {
    const settings = await this.prisma.setting.findUnique({ where: { id: 'default' } });
    if (!settings?.onlineOrderToken || settings.onlineOrderToken !== onlineToken) {
      throw new NotFoundException('Link order tidak valid. Minta link terbaru ke toko.');
    }
    return settings;
  }

  /**
   * Simpan cara bayar pilihan pelanggan; admin tinggal approve (PRD 5.5). QRIS mendapat kode
   * unik agar nominal (total + kode) tidak sama dengan order QRIS lain yang masih menunggu.
   */
  private async assignPayment(
    tx: Prisma.TransactionClient,
    orderId: string,
    method: { id: string; type: PaymentType },
    total: number,
  ) {
    let uniqueCode: number | null = null;
    if (method.type === 'QRIS') {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${UNIQUE_CODE_LOCK})`;
      const others = await tx.order.findMany({
        where: { status: 'PENDING', uniqueCode: { not: null } },
        select: { total: true, uniqueCode: true },
      });
      uniqueCode = pickUniqueCode(total, new Set(others.map((o) => o.total + (o.uniqueCode ?? 0))));
    }
    await tx.order.update({
      where: { id: orderId },
      data: { paymentMethodId: method.id, payAtCashier: method.type === 'CASH', uniqueCode },
    });
  }

  async getOrder(publicToken: string): Promise<PublicOrderView> {
    const [order, settings] = await Promise.all([
      this.prisma.order.findUnique({
        where: { publicToken },
        include: {
          ...orderInclude,
          paymentMethod: { select: { name: true, type: true, accountInfo: true } },
        },
      }),
      this.prisma.setting.findUnique({ where: { id: 'default' } }),
    ]);
    if (!order) throw new NotFoundException('Pesanan tidak ditemukan');
    const pending = order.status === 'PENDING';
    const type = order.paymentMethod?.type ?? null;
    const amount = order.total + (type === 'QRIS' ? (order.uniqueCode ?? 0) : 0);
    let qrisPayload: string | null = null;
    if (pending && type === 'QRIS' && settings?.qrisPayload) {
      try {
        qrisPayload = qrisWithAmount(settings.qrisPayload, amount);
      } catch {
        qrisPayload = null; // teks QRIS toko rusak → pelanggan memakai gambar QRIS statis
      }
    }
    return {
      orderNo: order.orderNo,
      publicToken: order.publicToken,
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
      type: order.type,
      customerName: order.customerName,
      tableName: order.table?.name ?? null,
      items: order.items.map((i) => ({
        productName: i.productName,
        categoryCode: i.categoryCode,
        packSize: i.packSize,
        price: i.price,
        qty: i.qty,
        subtotal: i.subtotal,
      })),
      subtotal: order.subtotal,
      discount: order.discount,
      total: order.total,
      payAtCashier: order.payAtCashier,
      paymentMethodName: order.paymentMethod?.name ?? null,
      hasPaymentProof: !!order.paymentProofUrl,
      reason: order.status === 'REJECTED' || order.status === 'CANCELLED' ? order.reason : null,
      createdAt: order.createdAt.toISOString(),
      approvedAt: order.approvedAt?.toISOString() ?? null,
      readyAt: order.readyAt?.toISOString() ?? null,
      handedOverAt: order.handedOverAt?.toISOString() ?? null,
      store: {
        name: settings?.storeName ?? 'Bekuin',
        qrisImageUrl: settings?.qrisImageUrl ?? null,
        phone: settings?.phone ?? null,
      },
      delivery: order.deliveryMethod
        ? {
            method: order.deliveryMethod,
            address: order.deliveryAddress,
            fee: order.deliveryFee,
            date: order.deliveryDate.toISOString().slice(0, 10),
          }
        : null,
      canCancel: pending && !order.paymentProofUrl && isCustomerSource(order.source),
      payment: {
        methodName: order.paymentMethod?.name ?? null,
        type,
        amount,
        uniqueCode: type === 'QRIS' ? order.uniqueCode : null,
        qrisPayload,
        accountInfo: type === 'TRANSFER' ? (order.paymentMethod?.accountInfo ?? null) : null,
      },
      canUploadProof: pending && type !== 'CASH' && isCustomerSource(order.source),
    };
  }

  async uploadProof(
    publicToken: string,
    file: Express.Multer.File | undefined,
  ): Promise<PublicOrderView> {
    const order = await this.prisma.order.findUnique({ where: { publicToken } });
    if (!order || !isCustomerSource(order.source))
      throw new NotFoundException('Pesanan tidak ditemukan');
    if (order.status !== 'PENDING') throw new BadRequestException('Pesanan sudah diproses');
    const url = await this.uploads.saveImage(file, 'proof');
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: order.id }, data: { paymentProofUrl: url } }),
      this.prisma.orderLog.create({
        data: { orderId: order.id, action: 'PROOF_UPLOADED', userId: null },
      }),
    ]);
    await this.orders.afterWrite(order.id, null, 'order.updated');
    return this.getOrder(publicToken);
  }

  async cancel(publicToken: string): Promise<PublicOrderView> {
    const order = await this.prisma.order.findUnique({ where: { publicToken } });
    if (!order || !isCustomerSource(order.source))
      throw new NotFoundException('Pesanan tidak ditemukan');
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.orders.lockPending(tx, order.id, null);
      if (locked.paymentProofUrl) {
        throw new BadRequestException(
          'Bukti bayar sudah dikirim. Hubungi kasir untuk membatalkan.',
        );
      }
      await this.orders.setStatus(
        tx,
        order.id,
        'PENDING',
        'CANCELLED',
        'CANCELLED',
        null,
        'Dibatalkan pelanggan',
      );
    });
    await this.orders.afterWrite(order.id, null, 'order.updated');
    return this.getOrder(publicToken);
  }
}
