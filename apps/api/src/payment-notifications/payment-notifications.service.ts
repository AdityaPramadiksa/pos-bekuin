import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaymentNotification } from '@prisma/client';
import type { PaymentNotificationView, PaymentWebhookSetup } from '@bekuin/shared';
import { PAYMENT_NOTIFICATION_SLACK_MS } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { PaymentNotificationDto, TestNotificationDto } from './dto/payment-notification.dto';
import { parsePaymentNotification } from './parse-notification';

/** Kunci advisory: notifikasi dicatat bergantian supaya cek duplikat aman. */
const NOTIFICATION_LOCK = 7_240_003;
/**
 * Notifikasi yang sama persis dalam rentang ini dianggap duplikat (MacroDroid bisa terpicu 2×).
 * Dibuat pendek karena notifikasi DANA tidak memuat nama pengirim: dua pembayaran asli dengan
 * nominal sama terlihat identik.
 */
const DUPLICATE_WINDOW_MS = 2 * 60_000;
/** Notifikasi yang ditampilkan sebagai pembanding bukti bayar: maksimal 3 hari setelah order. */
const MATCH_WINDOW_MS = 3 * 86_400_000;

const newKey = () => randomBytes(18).toString('base64url');

type NotificationWithOrder = PaymentNotification & {
  order: { id: string; orderNo: string; customerName: string | null } | null;
};

const toView = (n: NotificationWithOrder): PaymentNotificationView => ({
  id: n.id,
  app: n.app,
  title: n.title,
  text: n.text,
  amount: n.amount,
  result: n.result,
  message: n.message,
  order: n.order,
  receivedAt: n.receivedAt.toISOString(),
});

/**
 * Alat bantu cek bukti bayar (v2.4): MacroDroid di HP admin meneruskan notifikasi DANA
 * "uang masuk" dan server mencatatnya. Tidak ada order yang disetujui otomatis; admin melihat
 * catatan ini di samping foto bukti bayar pelanggan saat approve.
 */
@Injectable()
export class PaymentNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  // ───────────────────────── Webhook (publik, kunci rahasia) ─────────────────────────

  async receive(key: string, dto: PaymentNotificationDto): Promise<{ ok: true; result: string }> {
    const settings = await this.prisma.setting.findUnique({ where: { paymentWebhookKey: key } });
    if (!settings || key.length < 16) throw new NotFoundException('Webhook tidak ditemukan');

    const parsed = parsePaymentNotification(dto);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${NOTIFICATION_LOCK})`;
      const duplicate = await tx.paymentNotification.findFirst({
        where: {
          text: dto.text,
          title: dto.title ?? null,
          receivedAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
        },
        select: { id: true },
      });
      const outcome: { result: 'RECEIVED' | 'IGNORED'; message: string | null } = duplicate
        ? {
            result: 'IGNORED',
            message: 'Kemungkinan duplikat (notifikasi sama < 2 menit).',
          }
        : parsed.ignoreReason || parsed.amount === null
          ? { result: 'IGNORED', message: parsed.ignoreReason }
          : { result: 'RECEIVED', message: null };
      await tx.paymentNotification.create({
        data: {
          app: dto.app ?? null,
          title: dto.title ?? null,
          text: dto.text,
          amount: parsed.amount,
          ...outcome,
        },
      });
      return outcome.result;
    });
    this.realtime.paymentNotification();
    return { ok: true, result };
  }

  // ───────────────────────── Admin ─────────────────────────

  /**
   * Notifikasi uang masuk yang nominalnya sama dengan tagihan order, sejak order dibuat, dan
   * belum dipakai order lain. Ditampilkan di dialog approve sebagai pembanding bukti bayar.
   */
  async forOrder(orderId: string): Promise<PaymentNotificationView[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { total: true, uniqueCode: true, createdAt: true },
    });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    const since = new Date(order.createdAt.getTime() - PAYMENT_NOTIFICATION_SLACK_MS);
    const rows = await this.prisma.paymentNotification.findMany({
      where: {
        amount: order.total + (order.uniqueCode ?? 0),
        receivedAt: { gte: since, lte: new Date(order.createdAt.getTime() + MATCH_WINDOW_MS) },
        OR: [{ result: 'RECEIVED', orderId: null }, { orderId }],
      },
      include: { order: { select: { id: true, orderNo: true, customerName: true } } },
      orderBy: { receivedAt: 'asc' },
      take: 10,
    });
    return rows.map(toView);
  }

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

  /** Uji teks notifikasi: nominal terbaca? order mana yang menunggu dengan tagihan sama? */
  async test(dto: TestNotificationDto) {
    const parsed = parsePaymentNotification(dto);
    const matches =
      parsed.amount === null
        ? []
        : await this.prisma.order.findMany({
            where: { status: 'PENDING', total: parsed.amount, paymentMethod: { type: 'QRIS' } },
            select: { orderNo: true, customerName: true },
            orderBy: { createdAt: 'asc' },
            take: 10,
          });
    return { ...parsed, matches };
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
      notifications: rows.map(toView),
    };
  }
}
