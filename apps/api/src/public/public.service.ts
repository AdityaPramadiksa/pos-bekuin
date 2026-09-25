import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  isWithinOpeningHours,
  type OpeningHours,
  type PublicMenuResponse,
  type PublicOrderCreated,
  type PublicOrderView,
} from '@bekuin/shared';
import type { DiningTable, Setting } from '@prisma/client';
import { CatalogService } from '../menu/catalog.service';
import { orderInclude } from '../orders/order-mapper';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { UploadsService } from '../uploads/uploads.service';
import type { CreatePublicOrderDto } from './dto/public-order.dto';

export const MAX_PENDING_PER_TABLE = 3;
export const QR_ORDER_ATTEMPTS_PER_10_MIN = 10;

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

  private async findTable(qrToken: string): Promise<DiningTable> {
    const table = await this.prisma.diningTable.findUnique({ where: { qrToken } });
    if (!table?.isActive) throw new NotFoundException('QR tidak valid. Silakan hubungi kasir.');
    return table;
  }

  async menu(qrToken: string): Promise<PublicMenuResponse> {
    const [table, settings, catalog, categories] = await Promise.all([
      this.findTable(qrToken),
      this.prisma.setting.findUnique({ where: { id: 'default' } }),
      this.catalog.get(),
      this.prisma.salesCategory.findMany({
        where: { isActive: true, isCustomerVisible: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, code: true, name: true },
      }),
    ]);
    const visible = new Set(categories.map((c) => c.id));
    return {
      store: {
        name: settings?.storeName ?? 'Bekuin',
        tagline: settings?.tagline ?? null,
        logoUrl: settings?.logoUrl ?? null,
        ...storeStatus(settings),
        openingHours: (settings?.openingHours as OpeningHours | null) ?? null,
      },
      table: { code: table.code, name: table.name, isTakeaway: table.code === 'TAKEAWAY' },
      qrPaymentMode: settings?.qrPaymentMode ?? 'QRIS_ONLY',
      maxOrderTotal: settings?.qrMaxOrderTotal ?? 1_000_000,
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
    if (dto.payAtCashier && settings?.qrPaymentMode !== 'QRIS_OR_CASHIER') {
      throw new BadRequestException('Pembayaran untuk pesanan meja wajib lewat QRIS');
    }

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
      if (dto.payAtCashier) await tx.order.update({ where: { id }, data: { payAtCashier: true } });
      return id;
    });

    const order = await this.orders.afterWrite(orderId, null, 'order.created');
    return { orderNo: order.orderNo, publicToken: order.publicToken, total: order.total };
  }

  async getOrder(publicToken: string): Promise<PublicOrderView> {
    const [order, settings] = await Promise.all([
      this.prisma.order.findUnique({ where: { publicToken }, include: orderInclude }),
      this.prisma.setting.findUnique({ where: { id: 'default' } }),
    ]);
    if (!order) throw new NotFoundException('Pesanan tidak ditemukan');
    const pending = order.status === 'PENDING';
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
      canCancel: pending && !order.paymentProofUrl && order.source === 'QR_TABLE',
      canUploadProof: pending && !order.payAtCashier && order.source === 'QR_TABLE',
    };
  }

  async uploadProof(
    publicToken: string,
    file: Express.Multer.File | undefined,
  ): Promise<PublicOrderView> {
    const order = await this.prisma.order.findUnique({ where: { publicToken } });
    if (!order || order.source !== 'QR_TABLE')
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
    if (!order || order.source !== 'QR_TABLE')
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
