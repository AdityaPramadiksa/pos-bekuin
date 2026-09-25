import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate limit endpoint publik per (IP + token meja/link online/order), bukan hanya IP:
 * pelanggan di meja berbeda yang berbagi WiFi toko tidak saling memblokir. Webhook pembayaran
 * memakai kunci URL-nya.
 */
@Injectable()
export class PublicThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    const body = req.body as { qrToken?: string; onlineToken?: string } | undefined;
    const params = req.params as { qrToken?: string; onlineToken?: string };
    const token =
      body?.qrToken ??
      body?.onlineToken ??
      params.qrToken ??
      params.onlineToken ??
      (req.params as { publicToken?: string }).publicToken ??
      (req.params as { key?: string }).key ??
      '';
    return `${req.ip}:${String(token).slice(0, 64)}`;
  }
}
