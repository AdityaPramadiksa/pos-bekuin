import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate limit endpoint publik per (IP + token meja/order), bukan hanya IP:
 * pelanggan di meja berbeda yang berbagi WiFi toko tidak saling memblokir.
 */
@Injectable()
export class PublicThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    const token =
      (req.body as { qrToken?: string } | undefined)?.qrToken ??
      (req.params as { qrToken?: string; publicToken?: string }).qrToken ??
      (req.params as { publicToken?: string }).publicToken ??
      '';
    return `${req.ip}:${String(token).slice(0, 64)}`;
  }
}
