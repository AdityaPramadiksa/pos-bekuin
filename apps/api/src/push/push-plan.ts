import { SOURCE_LABEL, type OrderEvent } from '@bekuin/shared';

export interface PushMessage {
  title: string;
  body: string;
  /** Halaman yang dibuka saat notifikasi diketuk. */
  url: string;
  /** Notifikasi dengan tag sama saling menimpa (tidak menumpuk). */
  tag: string;
}

export type PushTarget =
  | { to: 'admins'; exceptUserId: string | null; message: PushMessage }
  | { to: 'user'; userId: string; message: PushMessage };

/**
 * Siapa yang perlu dikabari lewat Web Push untuk satu perubahan order (fungsi murni).
 * `actorId` = user yang melakukan aksi (null = pelanggan QR); pelaku tidak dikabari.
 */
export function pushPlan(
  event: 'order.created' | 'order.updated',
  order: OrderEvent,
  actorId: string | null,
): PushTarget[] {
  const tag = `order-${order.id}`;
  if (event === 'order.created') {
    return [
      {
        to: 'admins',
        exceptUserId: actorId,
        message: {
          title: `Order baru ${order.orderNo}`,
          body: `${SOURCE_LABEL[order.source]} · ${order.label}`,
          url: '/admin/approval',
          tag,
        },
      },
    ];
  }
  const targets: PushTarget[] = [];
  // Hasil approve/tolak untuk staff pembuat order.
  if (
    (order.status === 'PAID' || order.status === 'REJECTED') &&
    order.createdById &&
    order.createdById !== actorId
  ) {
    targets.push({
      to: 'user',
      userId: order.createdById,
      message: {
        title: `${order.orderNo} ${order.status === 'PAID' ? 'sudah dibayar' : 'ditolak'}`,
        body: order.label,
        url: '/staff/history',
        tag,
      },
    });
  }
  // Pelanggan QR mengirim bukti bayar atau membatalkan pesanan.
  if (actorId === null && (order.status === 'PENDING' || order.status === 'CANCELLED')) {
    targets.push({
      to: 'admins',
      exceptUserId: null,
      message: {
        title:
          order.status === 'PENDING'
            ? `Bukti bayar ${order.orderNo}`
            : `${order.orderNo} dibatalkan pelanggan`,
        body: order.label,
        url: '/admin/approval',
        tag,
      },
    });
  }
  return targets;
}
