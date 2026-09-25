import { Injectable } from '@nestjs/common';
import type { ImportCatalog, ImportResult, ParsedBatch } from '@bekuin/shared';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { dateOnly, todayKey } from '../common/dates';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { ImportPreviewDto, ImportSaveDto } from './dto/import.dto';
import { parseOrderText } from './parser';

@Injectable()
export class OrderImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly realtime: RealtimeGateway,
    private readonly push: PushService,
  ) {}

  async catalog(): Promise<ImportCatalog> {
    const [products, aliases] = await Promise.all([
      this.prisma.product.findMany({
        where: { isActive: true },
        include: {
          variants: {
            where: { isActive: true, category: { isActive: true } },
            include: { category: { select: { code: true } } },
          },
        },
      }),
      this.prisma.productAlias.findMany({ where: { product: { isActive: true } } }),
    ]);
    return {
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        variants: p.variants.map((v) => ({
          id: v.id,
          categoryCode: v.category.code,
          packSize: v.packSize,
          price: v.price,
        })),
      })),
      aliases: aliases.map((a) => ({ alias: a.alias, productId: a.productId })),
    };
  }

  /** Tidak menyimpan apa pun: urai teks, tandai pelanggan baru. */
  async preview(dto: ImportPreviewDto): Promise<ParsedBatch> {
    const parsed = parseOrderText(dto.text, await this.catalog(), {
      today: todayKey(),
      defaultDeliveryDate: dto.deliveryDate,
    });
    const names = parsed.customers.map((c) => c.nameNormalized).filter(Boolean);
    const existing = await this.prisma.customer.findMany({
      where: { isActive: true, nameNormalized: { in: names } },
      select: { id: true, nameNormalized: true },
    });
    const byName = new Map(existing.map((c) => [c.nameNormalized, c.id]));
    for (const c of parsed.customers) {
      c.customerId = byName.get(c.nameNormalized) ?? null;
      c.isNew = !!c.name && !c.customerId;
    }
    return parsed;
  }

  /** Semua order PENDING dibuat dalam satu transaksi dengan batch & tanggal kirim yang sama. */
  async save(dto: ImportSaveDto, user: JwtPayload): Promise<ImportResult> {
    const preorder = dto.deliveryDate > todayKey();
    const { batchId, orderIds } = await this.prisma.$transaction(
      async (tx) => {
        const batch = await tx.orderBatch.create({
          data: {
            deliveryDate: dateOnly(dto.deliveryDate),
            rawText: dto.rawText,
            createdById: user.sub,
          },
        });
        const orderIds: string[] = [];
        for (const c of dto.customers) {
          orderIds.push(
            await this.orders.createInTx(tx, {
              items: c.items,
              source: 'WA_IMPORT',
              customerName: c.name || null,
              deliveryDate: dto.deliveryDate,
              batchId: batch.id,
              createdById: user.sub,
              // Pre-order tidak cek stok saat input (produksi belum dilakukan); approve tetap cek.
              skipStockCheck: preorder,
            }),
          );
        }
        return { batchId: batch.id, orderIds };
      },
      { timeout: 30_000 },
    );
    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds } },
      include: { items: true },
    });
    this.realtime.batchCreated({ batchId, orders: orders.length, deliveryDate: dto.deliveryDate });
    this.push.batchCreated(orders.length, user.sub);
    return {
      batchId,
      orders: orders.length,
      packs: orders.flatMap((o) => o.items).reduce((sum, i) => sum + i.qty, 0),
      amount: orders.reduce((sum, o) => sum + o.total, 0),
    };
  }
}
