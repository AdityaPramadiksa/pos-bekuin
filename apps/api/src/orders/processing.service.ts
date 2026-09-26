import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { FulfillmentStatus } from '@prisma/client';
import type { OrderView, ProcessingView } from '@bekuin/shared';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { startOfBusinessDay, todayKey } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { orderInclude, toOrderEvent, toOrderView } from './order-mapper';

@Injectable()
export class ProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Order yang sedang diproses (semua tanggal kirim) + yang selesai hari ini.
   * Staff hanya memantau order yang dia input sendiri.
   */
  async list(user: JwtPayload): Promise<ProcessingView> {
    const isAdmin = user.role === 'ADMIN';
    const mine = isAdmin ? {} : { createdById: user.sub };
    const [processing, done] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: 'PAID', fulfillmentStatus: 'PROCESSING', ...mine },
        include: orderInclude,
        orderBy: [{ deliveryDate: 'asc' }, { approvedAt: 'asc' }],
        take: 500,
      }),
      this.prisma.order.findMany({
        where: {
          ...mine,
          status: 'PAID',
          fulfillmentStatus: 'DONE',
          completedAt: { gte: startOfBusinessDay(todayKey()) },
        },
        include: orderInclude,
        orderBy: { completedAt: 'desc' },
        take: 200,
      }),
    ]);
    return {
      processing: processing.map((o) => toOrderView(o, isAdmin)),
      done: done.map((o) => toOrderView(o, isAdmin)),
    };
  }

  /** Diproses ⇄ Selesai (khusus admin; staff hanya memantau). */
  async setStatus(id: string, status: FulfillmentStatus, user: JwtPayload): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    if (order.status !== 'PAID')
      throw new BadRequestException('Hanya order yang sudah disetujui yang bisa diproses');
    if (order.fulfillmentStatus === status) throw new BadRequestException('Status tidak berubah');

    const updated = await this.prisma.order.update({
      where: { id },
      data: { fulfillmentStatus: status, completedAt: status === 'DONE' ? new Date() : null },
      include: orderInclude,
    });
    await this.prisma.orderLog.create({
      data: {
        orderId: id,
        action: 'FULFILLMENT',
        reason: `${order.fulfillmentStatus} → ${status}`,
        userId: user.sub,
      },
    });
    this.realtime.fulfillmentChanged(toOrderEvent(updated));
    this.realtime.orderStatusForCustomer(updated.publicToken, {
      status: updated.status,
      fulfillmentStatus: status,
    });
    return toOrderView(updated, user.role === 'ADMIN');
  }
}
