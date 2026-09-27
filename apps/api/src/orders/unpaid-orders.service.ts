import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';

/** Seberapa sering pesanan kedaluwarsa dicek. */
const CHECK_EVERY_MS = 10 * 60_000;

/** Batas waktu bayar pesanan pelanggan (null = tidak ada batas). */
export function payDeadline(order: { createdAt: Date }, hours: number): Date | null {
  return hours > 0 ? new Date(order.createdAt.getTime() + hours * 3_600_000) : null;
}

/**
 * Pesanan pelanggan (link online/QR) yang memilih QRIS/Transfer tapi tidak mengunggah bukti bayar
 * dalam `settings.unpaidCancelHours` jam dibatalkan otomatis, supaya tidak menggantung dan tidak
 * menghalangi pelanggan memesan lagi (maks. pesanan menunggu per No. WA). Pesanan COD tidak
 * disentuh: itu menunggu konfirmasi toko, bukan pelanggan.
 */
@Injectable()
export class UnpaidOrdersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UnpaidOrdersService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return; // test memanggil cancelExpired() langsung
    this.timer = setInterval(() => {
      this.cancelExpired().catch((e: unknown) =>
        this.logger.warn(`Gagal membatalkan pesanan kedaluwarsa: ${String(e)}`),
      );
    }, CHECK_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Batalkan pesanan yang lewat batas waktu bayar; balikan jumlah yang dibatalkan. */
  async cancelExpired(now = new Date()): Promise<number> {
    const settings = await this.prisma.setting.findUnique({ where: { id: 'default' } });
    const hours = settings?.unpaidCancelHours ?? 24;
    if (hours <= 0) return 0;
    const cutoff = new Date(now.getTime() - hours * 3_600_000);
    const expired = await this.prisma.order.findMany({
      where: {
        status: 'PENDING',
        source: { in: ['ONLINE', 'QR_TABLE'] },
        paymentProofUrl: null,
        paymentMethod: { type: { not: 'CASH' } },
        createdAt: { lt: cutoff },
      },
      select: { id: true },
      take: 200,
    });
    let cancelled = 0;
    for (const { id } of expired) {
      const done = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
        const order = await tx.order.findUnique({ where: { id } });
        // Dicek ulang di dalam kunci: pelanggan mungkin baru saja mengunggah bukti bayar.
        if (!order || order.status !== 'PENDING' || order.paymentProofUrl) return false;
        await this.orders.setStatus(
          tx,
          id,
          'PENDING',
          'CANCELLED',
          'CANCELLED',
          null,
          `Otomatis dibatalkan: belum ada bukti bayar dalam ${hours} jam`,
        );
        return true;
      });
      if (done) {
        cancelled += 1;
        await this.orders.afterWrite(id, null, 'order.updated');
      }
    }
    if (cancelled) this.logger.log(`${cancelled} pesanan tanpa bukti bayar dibatalkan otomatis`);
    return cancelled;
  }
}
