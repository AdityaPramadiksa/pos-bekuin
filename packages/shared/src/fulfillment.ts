/**
 * Alur kerja order setelah masuk:
 *   Menunggu persetujuan → (admin setujui / QRIS terdeteksi) → Diproses → (admin klik Selesai) →
 *   Dikirim (pesanan online diantar) | Siap diambil (pelanggan ambil sendiri / QR meja) | Selesai (order staff).
 * Status pembayaran terpisah: order disetujui bisa "Belum dibayar" (COD / bayar saat ambil).
 */
import type { DeliveryMethod, FulfillmentStatus, OrderSource, OrderStatus } from './enums';

type StageInput = {
  status: OrderStatus;
  fulfillmentStatus: FulfillmentStatus;
  source: OrderSource;
  deliveryMethod: DeliveryMethod | null;
};

export type OrderStage =
  | 'PENDING'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'READY_PICKUP'
  | 'DONE'
  | 'REJECTED'
  | 'CANCELLED'
  | 'VOIDED';

export const ORDER_STAGE_LABEL: Record<OrderStage, string> = {
  PENDING: 'Menunggu persetujuan',
  PROCESSING: 'Diproses',
  SHIPPED: 'Dikirim',
  READY_PICKUP: 'Siap diambil',
  DONE: 'Selesai',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
  VOIDED: 'Void',
};

/** Status akhir setelah Selesai, tergantung siapa yang memesan dan cara terimanya. */
export function finalStage(o: Pick<StageInput, 'source' | 'deliveryMethod'>): OrderStage {
  if (o.deliveryMethod === 'DELIVERY') return 'SHIPPED';
  if (o.deliveryMethod === 'PICKUP' || o.source === 'QR_TABLE' || o.source === 'ONLINE')
    return 'READY_PICKUP';
  return 'DONE';
}

export function orderStage(o: StageInput): OrderStage {
  if (o.status !== 'PAID') return o.status;
  return o.fulfillmentStatus === 'DONE' ? finalStage(o) : 'PROCESSING';
}

/** Teks tombol untuk menyelesaikan order yang sedang diproses. */
export function completeActionLabel(o: Pick<StageInput, 'source' | 'deliveryMethod'>): string {
  const stage = finalStage(o);
  return stage === 'SHIPPED'
    ? 'Tandai dikirim'
    : stage === 'READY_PICKUP'
      ? 'Siap diambil'
      : 'Selesai';
}

/** Order disetujui tetapi uangnya belum diterima (COD / bayar saat ambil). */
export const isUnpaid = (o: { status: OrderStatus; paidAt: string | Date | null }) =>
  o.status === 'PAID' && !o.paidAt;

export interface ProcessingItemInput {
  productId: string;
  productName: string;
  categoryCode: string;
  packSize: number;
  qty: number;
}

export interface ProcessingSummaryRow {
  productId: string;
  productName: string;
  /** Total pcs semua kemasan & kategori. */
  pcs: number;
  packs: number;
  /** Rincian per kategori + isi, urut Frozen dulu lalu isi terkecil. */
  lines: { categoryCode: string; packSize: number; packs: number }[];
}

export interface ProcessingSummary {
  orders: number;
  packs: number;
  pcs: number;
  /** Pack siap makan yang perlu digoreng dulu. */
  fryPacks: number;
  rows: ProcessingSummaryRow[];
}

const CATEGORY_ORDER: Record<string, number> = { FROZEN: 0, SIAP_MAKAN: 1 };

/** Rangkuman semua item dari order yang diproses: berapa pack & pcs per produk yang harus disiapkan. */
export function summarizeProcessing(orders: { items: ProcessingItemInput[] }[]): ProcessingSummary {
  const byProduct = new Map<string, ProcessingSummaryRow>();
  let packs = 0;
  let pcs = 0;
  let fryPacks = 0;
  for (const order of orders) {
    for (const item of order.items) {
      const row = byProduct.get(item.productId) ?? {
        productId: item.productId,
        productName: item.productName,
        pcs: 0,
        packs: 0,
        lines: [],
      };
      row.pcs += item.qty * item.packSize;
      row.packs += item.qty;
      const line = row.lines.find(
        (l) => l.categoryCode === item.categoryCode && l.packSize === item.packSize,
      );
      if (line) line.packs += item.qty;
      else
        row.lines.push({
          categoryCode: item.categoryCode,
          packSize: item.packSize,
          packs: item.qty,
        });
      byProduct.set(item.productId, row);
      packs += item.qty;
      pcs += item.qty * item.packSize;
      if (item.categoryCode === 'SIAP_MAKAN') fryPacks += item.qty;
    }
  }
  const rows = [...byProduct.values()]
    .map((r) => ({
      ...r,
      lines: r.lines.sort(
        (a, b) =>
          (CATEGORY_ORDER[a.categoryCode] ?? 9) - (CATEGORY_ORDER[b.categoryCode] ?? 9) ||
          a.packSize - b.packSize,
      ),
    }))
    .sort((a, b) => b.pcs - a.pcs || a.productName.localeCompare(b.productName));
  return { orders: orders.length, packs, pcs, fryPacks, rows };
}
