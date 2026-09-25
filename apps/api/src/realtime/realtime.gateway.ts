import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { OrderEvent } from '@bekuin/shared';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Room:
 * - admins            : semua admin (order baru, perubahan status)
 * - user:<id>         : staff pembuat order (hasil approve/tolak)
 * - kitchen           : staff & admin (antrian dapur)
 * - order:<publicToken>: halaman lacak pesanan pelanggan QR (tanpa login)
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    // Token boleh kosong (pelanggan QR). Token yang ada tapi tidak valid ditolak
    // supaya klien tahu harus refresh token lalu menyambung ulang.
    server.use(async (socket, next) => {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next();
      try {
        const user = await this.jwt.verifyAsync<JwtPayload>(token, {
          secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        });
        socket.data.user = user;
        await socket.join([
          `user:${user.sub}`,
          'kitchen',
          ...(user.role === 'ADMIN' ? ['admins'] : []),
        ]);
        next();
      } catch {
        next(new Error('unauthorized'));
      }
    });
  }

  /** Pelanggan memantau satu pesanan lewat publicToken (divalidasi ke DB). */
  @SubscribeMessage('order.watch')
  async watchOrder(@ConnectedSocket() socket: Socket, @MessageBody() publicToken: unknown) {
    if (typeof publicToken !== 'string' || publicToken.length > 64) return { ok: false };
    const exists = await this.prisma.order.count({ where: { publicToken } });
    if (!exists) return { ok: false };
    await socket.join(`order:${publicToken}`);
    return { ok: true };
  }

  // ── Pengirim event (dipanggil service setelah transaksi DB selesai) ──

  orderChanged(event: 'order.created' | 'order.updated', order: OrderEvent) {
    this.emit(
      ['admins', ...(order.createdById ? [`user:${order.createdById}`] : [])],
      event,
      order,
    );
  }

  fulfillmentChanged(order: OrderEvent) {
    this.emit(['kitchen', 'admins'], 'order.fulfillment', order);
  }

  orderStatusForCustomer(
    publicToken: string,
    payload: { status: string; fulfillmentStatus: string },
  ) {
    this.emit([`order:${publicToken}`], 'order.status', payload);
  }

  batchCreated(payload: { batchId: string; orders: number; deliveryDate: string }) {
    this.emit(['admins'], 'batch.created', payload);
  }

  stockChanged() {
    this.emit(['admins', 'kitchen'], 'stock.changed', {});
  }

  private emit(rooms: string[], event: string, payload: unknown) {
    if (!this.server) return; // mis. saat unit test tanpa server socket
    try {
      this.server.to(rooms).emit(event, payload);
    } catch (error) {
      this.logger.warn(`Gagal kirim event ${event}: ${String(error)}`);
    }
  }
}
