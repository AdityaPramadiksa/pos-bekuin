import { BadRequestException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrderEvent } from '@bekuin/shared';
import webpush, { WebPushError } from 'web-push';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { pushPlan, type PushMessage } from './push-plan';

/**
 * Endpoint langganan berasal dari browser lalu dipanggil server, jadi dibatasi ke layanan
 * push resmi (Chrome/Android, Firefox, Safari/iOS, Edge) agar tidak bisa dipakai SSRF.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /\.notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private enabled = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get('VAPID_PUBLIC_KEY', { infer: true });
    const privateKey = this.config.get('VAPID_PRIVATE_KEY', { infer: true });
    if (!publicKey || !privateKey) {
      this.logger.log('Web Push nonaktif (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY kosong)');
      return;
    }
    webpush.setVapidDetails(
      this.config.get('VAPID_SUBJECT', { infer: true }),
      publicKey,
      privateKey,
    );
    this.enabled = true;
  }

  publicKey(): { enabled: boolean; publicKey: string | null } {
    return {
      enabled: this.enabled,
      publicKey: this.enabled
        ? (this.config.get('VAPID_PUBLIC_KEY', { infer: true }) ?? null)
        : null,
    };
  }

  async subscribe(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ) {
    if (!isAllowedPushEndpoint(sub.endpoint)) {
      throw new BadRequestException('Layanan push browser ini tidak didukung');
    }
    // Satu perangkat = satu endpoint; bila HP dipakai user lain, langganan pindah pemilik.
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent?.slice(0, 200) ?? null,
      },
      update: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent?.slice(0, 200) ?? null,
        lastUsedAt: new Date(),
      },
    });
    return { ok: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { ok: true };
  }

  /** Dipanggil setelah order berubah; tidak pernah melempar error ke pemanggil. */
  orderChanged(
    event: 'order.created' | 'order.updated',
    order: OrderEvent,
    actorId: string | null,
  ) {
    if (!this.enabled) return;
    for (const target of pushPlan(event, order, actorId)) {
      const where =
        target.to === 'admins'
          ? {
              user: { role: 'ADMIN' as const, isActive: true },
              ...(target.exceptUserId ? { userId: { not: target.exceptUserId } } : {}),
            }
          : { userId: target.userId, user: { isActive: true } };
      void this.send(where, target.message);
    }
  }

  batchCreated(count: number, actorId: string) {
    if (!this.enabled) return;
    void this.send(
      { user: { role: 'ADMIN', isActive: true }, userId: { not: actorId } },
      {
        title: `${count} pre-order baru dari WhatsApp`,
        body: 'Cek Rekap Produksi & Approval',
        url: '/admin/approval',
        tag: 'wa-batch',
      },
    );
  }

  private async send(
    where: NonNullable<Parameters<PrismaService['pushSubscription']['findMany']>[0]>['where'],
    message: PushMessage,
  ) {
    try {
      const subs = await this.prisma.pushSubscription.findMany({ where });
      const payload = JSON.stringify(message);
      await Promise.all(
        subs.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload,
              { TTL: 60 * 60, urgency: 'high' },
            );
          } catch (error) {
            // 404/410 = langganan sudah dicabut di perangkat → hapus.
            if (error instanceof WebPushError && [404, 410].includes(error.statusCode)) {
              await this.prisma.pushSubscription.deleteMany({ where: { id: s.id } });
            } else {
              this.logger.warn(`Gagal kirim push: ${(error as Error).message}`);
            }
          }
        }),
      );
    } catch (error) {
      this.logger.warn(`Gagal menyiapkan push: ${(error as Error).message}`);
    }
  }
}
