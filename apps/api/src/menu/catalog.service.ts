import { Injectable } from '@nestjs/common';
import { businessDateKey, type CatalogResponse } from '@bekuin/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** Menu aktif untuk layar POS, dengan stok tersedia per produk. */
  async get(): Promise<CatalogResponse> {
    const [categories, products, pending] = await Promise.all([
      this.prisma.salesCategory.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, code: true, name: true },
      }),
      this.prisma.product.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          variants: {
            where: { isActive: true, category: { isActive: true } },
            include: { category: { select: { code: true } } },
            orderBy: { packSize: 'asc' },
          },
        },
      }),
      this.pendingPcsByProduct(),
    ]);

    return {
      categories,
      products: products
        .filter((p) => p.variants.length > 0)
        .map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          isAvailable: p.isAvailable,
          stockPcs: p.stockPcs,
          availablePcs: Math.max(0, p.stockPcs - (pending.get(p.id) ?? 0)),
          variants: p.variants.map((v) => ({
            id: v.id,
            categoryId: v.categoryId,
            categoryCode: v.category.code,
            packSize: v.packSize,
            price: v.price,
          })),
        })),
    };
  }

  /** Pcs yang sudah "dipesan" oleh order PENDING dengan tanggal kirim hari ini atau sebelumnya. */
  private async pendingPcsByProduct(): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<{ productId: string; pcs: number }[]>`
      SELECT v."productId" AS "productId", COALESCE(SUM(oi.qty * oi."packSize"), 0)::int AS pcs
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      JOIN product_variants v ON v.id = oi."variantId"
      WHERE o.status = 'PENDING' AND o."deliveryDate" <= ${businessDateKey()}::date
      GROUP BY v."productId"`;
    return new Map(rows.map((r) => [r.productId, r.pcs]));
  }
}
