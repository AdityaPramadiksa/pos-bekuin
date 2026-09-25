import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FulfillmentStatus } from '@prisma/client';
import { FULFILLMENT_FLOW, nextFulfillment, type OrderView } from '@bekuin/shared';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { dateOnly, todayKey } from '../common/dates';
import { orderInclude, toOrderEvent, toOrderView } from './order-mapper';

const TIMESTAMP: Partial<Record<FulfillmentStatus, 'preparingAt' | 'readyAt' | 'handedOverAt'>> = {
  PREPARING: 'preparingAt',
  READY: 'readyAt',
  HANDED_OVER: 'handedOverAt',
};

@Injectable()
export class KitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Order lunas yang belum diserahkan, dengan tanggal kirim hari ini atau sebelumnya (terlama di atas). */
  async queue(user: JwtPayload): Promise<OrderView[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        status: 'PAID',
        fulfillmentStatus: { not: 'HANDED_OVER' },
        deliveryDate: { lte: dateOnly(todayKey()) },
      },
      include: orderInclude,
      orderBy: { approvedAt: 'asc' },
      take: 200,
    });
    return orders.map((o) => toOrderView(o, user.role === 'ADMIN'));
  }

  /** Staff hanya boleh maju satu langkah; admin boleh ke status mana pun (koreksi). */
  async setStatus(id: string, status: FulfillmentStatus, user: JwtPayload): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order tidak ditemukan');
    if (order.status !== 'PAID')
      throw new BadRequestException('Hanya order lunas yang masuk antrian dapur');
    if (order.fulfillmentStatus === status) throw new BadRequestException('Status tidak berubah');
    const forward = nextFulfillment(order.fulfillmentStatus) === status;
    if (!forward && user.role !== 'ADMIN') {
      throw new ForbiddenException('Staff hanya bisa memajukan status satu langkah');
    }

    const stamp = TIMESTAMP[status];
    // Mundur: hapus stempel waktu langkah yang dibatalkan.
    const clear = FULFILLMENT_FLOW.slice(FULFILLMENT_FLOW.indexOf(status) + 1)
      .map((s) => TIMESTAMP[s])
      .filter(Boolean)
      .reduce((acc, key) => ({ ...acc, [key!]: null }), {});
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        fulfillmentStatus: status,
        ...clear,
        ...(stamp && forward ? { [stamp]: new Date() } : {}),
      },
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
