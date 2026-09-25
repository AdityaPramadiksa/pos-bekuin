import { BadRequestException } from '@nestjs/common';

export interface PricedVariant {
  id: string;
  productId: string;
  productName: string;
  categoryCode: string;
  packSize: number;
  price: number;
  isActive: boolean;
  categoryActive: boolean;
  categoryCustomerVisible: boolean;
  productActive: boolean;
  productAvailable: boolean;
}

export interface RequestedItem {
  variantId: string;
  qty: number;
  note?: string | null;
}

export interface PricedItem {
  variantId: string;
  productId: string;
  productName: string;
  categoryCode: string;
  packSize: number;
  price: number;
  qty: number;
  subtotal: number;
  note: string | null;
}

export const MAX_QTY_PER_ITEM = 200;

/**
 * Susun item order dari varian di DB. Harga SELALU dari DB, bukan dari klien.
 * Baris dengan varian + catatan sama digabung.
 */
export function priceItems(
  requested: RequestedItem[],
  variants: Map<string, PricedVariant>,
  options: { customerFacing?: boolean } = {},
): { items: PricedItem[]; subtotal: number } {
  if (requested.length === 0) throw new BadRequestException('Order minimal berisi 1 item');

  const merged = new Map<string, PricedItem>();
  for (const req of requested) {
    if (!Number.isInteger(req.qty) || req.qty < 1 || req.qty > MAX_QTY_PER_ITEM) {
      throw new BadRequestException(`Jumlah pack harus 1–${MAX_QTY_PER_ITEM}`);
    }
    const v = variants.get(req.variantId);
    if (!v || !v.isActive || !v.productActive || !v.categoryActive) {
      throw new BadRequestException(
        'Ada menu yang sudah tidak tersedia. Muat ulang menu lalu coba lagi.',
      );
    }
    if (options.customerFacing && !v.categoryCustomerVisible) {
      throw new BadRequestException('Ada menu yang tidak tersedia untuk pesanan meja.');
    }
    if (!v.productAvailable) throw new BadRequestException(`${v.productName} sedang habis`);

    const note = req.note?.trim() || null;
    const key = `${v.id}|${note ?? ''}`;
    const prev = merged.get(key);
    const qty = (prev?.qty ?? 0) + req.qty;
    if (qty > MAX_QTY_PER_ITEM)
      throw new BadRequestException(`Jumlah pack maksimal ${MAX_QTY_PER_ITEM} per item`);
    merged.set(key, {
      variantId: v.id,
      productId: v.productId,
      productName: v.productName,
      categoryCode: v.categoryCode,
      packSize: v.packSize,
      price: v.price,
      qty,
      subtotal: qty * v.price,
      note,
    });
  }
  const items = [...merged.values()];
  return { items, subtotal: items.reduce((sum, i) => sum + i.subtotal, 0) };
}

/** Kebutuhan pcs per produk (Frozen & Siap Makan memotong stok produk yang sama). */
export function pcsByProduct(
  items: { productId: string; qty: number; packSize: number }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const i of items) map.set(i.productId, (map.get(i.productId) ?? 0) + i.qty * i.packSize);
  return map;
}

/** Validasi pembayaran; balikan nilai yang disimpan. */
export function settlePayment(
  total: number,
  paymentType: string,
  paidAmount: number | undefined,
): { paidAmount: number; changeAmount: number } {
  if (paymentType !== 'CASH') return { paidAmount: total, changeAmount: 0 };
  if (paidAmount === undefined) throw new BadRequestException('Masukkan uang yang diterima');
  if (paidAmount < total) throw new BadRequestException('Uang yang diterima kurang dari total');
  return { paidAmount, changeAmount: paidAmount - total };
}

/** Pesanan yang dibuat pelanggan sendiri (QR meja atau link online): isinya final. */
export const isCustomerSource = (source: string) => source === 'QR_TABLE' || source === 'ONLINE';

/**
 * Pesanan pelanggan QR sudah final (pelanggan membayar sesuai isi & total pesanannya):
 * admin hanya approve atau tolak, tidak mengubah item/jumlah dan tidak memberi diskon.
 */
export function assertCustomerOrderUnchanged(
  source: string,
  currentQty: ReadonlyMap<string, number>,
  changes: { items?: { id: string; qty: number }[]; discount?: number },
): void {
  if (!isCustomerSource(source)) return;
  if ((changes.items ?? []).some((c) => currentQty.get(c.id) !== c.qty)) {
    throw new BadRequestException(
      'Pesanan pelanggan tidak bisa diubah. Tolak dengan alasan bila ada item yang tidak tersedia.',
    );
  }
  if ((changes.discount ?? 0) > 0) {
    throw new BadRequestException('Pesanan pelanggan tidak bisa diberi diskon');
  }
}
