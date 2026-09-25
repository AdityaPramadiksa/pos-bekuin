import { randomBytes } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PaymentNotificationResult, Prisma } from '@prisma/client';
import {
  formatRupiah,
  type PaymentNotificationView,
  type PaymentWebhookSetup,
} from '@bekuin/shared';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { PaymentNotificationDto, TestNotificationDto } from './dto/payment-notification.dto';
import { parsePaymentNotification } from './parse-notification';

type Tx = Prisma.TransactionClient;

/** Kunci advisory: satu notifikasi diproses bergantian (duplikat & pencocokan aman). */
const NOTIFICATION_LOCK = 7_240_003;
/** Notifikasi yang sama persis dalam rentang ini dianggap duplikat (MacroDroid bisa terpicu 2×). */
const DUPLICATE_WINDOW_MS = 10 * 60_000;
/** Order QRIS yang dicocokkan: yang dibuat dalam 3 hari terakhir. */
const MATCH_WINDOW_MS = 3 * 86_400_000;

const newKey = () => randomBytes(18).toString('base64url');

export interface NotificationOutcome {
  result: PaymentNotificationResult;
  message: string | null;
  orderId: string | null;
  orderNo: string | null;
  amount: number | null;
}

@Injectable()
export class PaymentNotificationsService {
  private readonly logger = new Logger(PaymentNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ───────────────────────── Webhook (publik, kunci rahasia) ─────────────────────────

  async receive(key: string, dto: PaymentNotificationDto): Promise<{ ok: true; result: string }> {
    const settings = await this.prisma.setting.findUnique({ where: { paymentWebhookKey: key } });
    if (!settings || key.length < 16) throw new NotFoundException('Webhook tidak ditemukan');

    const outcome = await this.process(dto);
    if (outcome.result === 'MATCHED' && outcome.orderId) {
      await this.orders.afterWrite(outcome.orderId, null, 'order.updated');
      this.realtime.stockChanged();
      this.realtime.financeChanged();
      this.realtime.autoApproved({
        orderId: outcome.orderId,
        orderNo: outcome.orderNo!,
        amount: outcome.amount!,
      });
    }
    this.realtime.paymentNotification();
    return { ok: true, result: outcome.result };
  }

  /** Baca → cocokkan nominal (total + kode unik) → setujui otomatis. Semua hasil dicatat. */
  private async process(dto: PaymentNotificationDto): Promise<NotificationOutcome> {
    const parsed = parsePaymentNotification(dto);
    const base = { app: dto.app ?? null, title: dto.title ?? null, text: dto.text };
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${NOTIFICATION_LOCK})`;
        const record = async (o: NotificationOutcome) => {
          await tx.paymentNotification.create({
            data: {
              ...base,
              amount: o.amount,
              result: o.result,
              message: o.message,
              orderId: o.orderId,
            },
          });
          return o;
        };
        const none = { orderId: null, orderNo: null, amount: parsed.amount };

        const duplicate = await tx.paymentNotification.findFirst({
          where: {
            text: dto.text,
            title: dto.title ?? null,
            receivedAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
          },
          select: { id: true },
        });
        if (duplicate)
          return record({ ...none, result: 'IGNORED', message: 'Duplikat notifikasi' });
        if (parsed.ignoreReason || parsed.amount === null)
          return record({ ...none, result: 'IGNORED', message: parsed.ignoreReason });

        const candidates = await this.candidates(tx, parsed.amount);
        if (candidates.length === 0)
          return record({
            ...none,
            result: 'UNMATCHED',
            message: 'Tidak ada pesanan QRIS menunggu dengan nominal ini',
          });
        if (candidates.length > 1)
          return record({
            ...none,
            result: 'AMBIGUOUS',
            message: `Cocok dengan ${candidates.map((c) => c.orderNo).join(', ')} — setujui manual`,
          });

        const [order] = candidates;
        await this.orders.lockPending(tx, order.id, null);
        // Uang sudah masuk: persetujuan tidak boleh gagal karena stok (stok boleh minus).
        await this.orders.approveInTx(tx, order.id, {}, null, {
          allowNegativeStock: true,
          logReason: `QRIS otomatis · notifikasi ${dto.app ?? 'e-wallet'} ${formatRupiah(parsed.amount)}`,
        });
        return record({
          result: 'MATCHED',
          message: null,
          orderId: order.id,
          orderNo: order.orderNo,
          amount: parsed.amount,
        });
      });
    } catch (error) {
      // Cocok tapi gagal disetujui (mis. metode QRIS dinonaktifkan): catat, admin setujui manual.
      const message =
        (error as { response?: { message?: string } }).response?.message ??
        (error instanceof Error ? error.message : 'Gagal');
      this.logger.warn(`Notifikasi pembayaran gagal diproses: ${message}`);
      await this.prisma.paymentNotification.create({
        data: { ...base, amount: parsed.amount, result: 'FAILED', message: String(message) },
      });
      return {
        result: 'FAILED',
        message: String(message),
        orderId: null,
        orderNo: null,
        amount: parsed.amount,
      };
    }
  }

  /** Order QRIS pelanggan yang menunggu dengan nominal bayar (total + kode unik) sama persis. */
  private async candidates(db: Tx | PrismaService, amount: number) {
    const orders = await db.order.findMany({
      where: {
        status: 'PENDING',
        uniqueCode: { not: null },
        paymentMethod: { type: 'QRIS' },
        createdAt: { gte: new Date(Date.now() - MATCH_WINDOW_MS) },
      },
      select: { id: true, orderNo: true, total: true, uniqueCode: true, customerName: true },
    });
    return orders.filter((o) => o.total + (o.uniqueCode ?? 0) === amount);
  }

  // ───────────────────────── Admin ─────────────────────────

  async setup(): Promise<PaymentWebhookSetup> {
    let s = await this.prisma.setting.findUnique({ where: { id: 'default' } });
    if (!s?.paymentWebhookKey) {
      s = await this.prisma.setting.upsert({
        where: { id: 'default' },
        update: { paymentWebhookKey: newKey() },
        create: { id: 'default', paymentWebhookKey: newKey() },
      });
    }
    return this.view(s.paymentWebhookKey!);
  }

  async rotateKey(): Promise<PaymentWebhookSetup> {
    const s = await this.prisma.setting.upsert({
      where: { id: 'default' },
      update: { paymentWebhookKey: newKey() },
      create: { id: 'default', paymentWebhookKey: newKey() },
    });
    return this.view(s.paymentWebhookKey!);
  }

  /** Uji teks notifikasi tanpa menyetujui apa pun (untuk mencoba format notifikasi DANA). */
  async test(dto: TestNotificationDto) {
    const parsed = parsePaymentNotification(dto);
    const matches = parsed.amount === null ? [] : await this.candidates(this.prisma, parsed.amount);
    return {
      ...parsed,
      matches: matches.map((m) => ({ orderNo: m.orderNo, customerName: m.customerName })),
    };
  }

  private async view(key: string): Promise<PaymentWebhookSetup> {
    const rows = await this.prisma.paymentNotification.findMany({
      orderBy: { receivedAt: 'desc' },
      take: 30,
      include: { order: { select: { id: true, orderNo: true, customerName: true } } },
    });
    return {
      key,
      path: `/api/v1/public/payment-notifications/${key}`,
      notifications: rows.map((n): PaymentNotificationView => ({
        id: n.id,
        app: n.app,
        title: n.title,
        text: n.text,
        amount: n.amount,
        result: n.result,
        message: n.message,
        order: n.order,
        receivedAt: n.receivedAt.toISOString(),
      })),
    };
  }
}
