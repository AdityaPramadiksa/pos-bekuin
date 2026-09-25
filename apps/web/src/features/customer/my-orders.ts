/** Riwayat pesanan pelanggan di HP ini (localStorage), untuk tautan "Pesanan saya" & "Pesan lagi". */
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

export function loadMyOrders(): MyOrder[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as MyOrder[];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return list.filter((o) => new Date(o.createdAt).getTime() > cutoff);
  } catch {
    return [];
  }
}

export function saveMyOrder(order: MyOrder) {
  try {
    localStorage.setItem(KEY, JSON.stringify([order, ...loadMyOrders()].slice(0, 20)));
  } catch {
    // mode privat / penyimpanan penuh: abaikan
  }
}

export const findMyOrder = (publicToken: string) =>
  loadMyOrders().find((o) => o.publicToken === publicToken);
