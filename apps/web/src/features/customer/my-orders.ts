/** Riwayat pesanan pelanggan di HP ini (localStorage): halaman Riwayat pesanan & "Pesan lagi". */
export interface MyOrder {
  publicToken: string;
  orderNo: string;
  /** Token QR meja (riwayat lama); pesanan baru memakai menuPath. */
  qrToken?: string;
  /** Halaman menu asal untuk tombol "Pesan lagi": /m/<qrToken> atau /pesan/<token>. */
  menuPath?: string;
  tableName: string;
  createdAt: string;
}

const KEY = 'bekuin-my-orders';
/** Riwayat disimpan 90 hari, maksimal 50 pesanan terakhir. */
const KEEP_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_ORDERS = 50;

export function loadMyOrders(): MyOrder[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as MyOrder[];
    const cutoff = Date.now() - KEEP_MS;
    return list.filter((o) => new Date(o.createdAt).getTime() > cutoff);
  } catch {
    return [];
  }
}

export function saveMyOrder(order: MyOrder) {
  try {
    localStorage.setItem(KEY, JSON.stringify([order, ...loadMyOrders()].slice(0, MAX_ORDERS)));
  } catch {
    // mode privat / penyimpanan penuh: abaikan
  }
}

export const findMyOrder = (publicToken: string) =>
  loadMyOrders().find((o) => o.publicToken === publicToken);
