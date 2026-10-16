import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Jumlah pack maksimal per item, sama dengan batas server (order-pricing.ts). */
export const MAX_QTY_PER_ITEM = 200;
/** Batas untuk pesanan pelanggan (link online / QR), sama dengan DTO publik. */
export const CUSTOMER_MAX_QTY_PER_ITEM = 50;

export interface CartLine {
  variantId: string;
  productId: string;
  productName: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  packSize: number;
  price: number;
  qty: number;
}

export interface CartMeta {
  customerName: string;
  customerPhone: string;
  note: string;
  type: 'TAKEAWAY' | 'DINE_IN';
  tableId: string;
  deliveryDate: string; // '' = hari ini
  /** Ongkir tambahan (rupiah), hanya diisi admin. Keranjang lama bisa belum punya kolom ini. */
  deliveryFee?: number;
  /** Ambil sendiri ke lokasi / diantar. Keranjang lama belum punya → dianggap ambil sendiri. */
  deliveryMethod?: 'PICKUP' | 'DELIVERY';
  deliveryAddress?: string;
}

interface CartState {
  lines: CartLine[];
  meta: CartMeta;
  add: (line: Omit<CartLine, 'qty'>, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  setMeta: (meta: Partial<CartMeta>) => void;
  clear: () => void;
}

const EMPTY_META: CartMeta = {
  customerName: '',
  customerPhone: '',
  note: '',
  type: 'TAKEAWAY',
  tableId: '',
  deliveryDate: '',
  deliveryFee: 0,
  deliveryMethod: 'PICKUP',
  deliveryAddress: '',
};

const stores = new Map<string, UseBoundStore<StoreApi<CartState>>>();

/** Keranjang tersimpan di localStorage (tidak hilang saat aplikasi tertutup). Satu store per `key`. */
export function getCartStore(key: string) {
  let store = stores.get(key);
  if (!store) {
    store = create<CartState>()(
      persist(
        (set) => ({
          lines: [],
          meta: EMPTY_META,
          add: (line, qty = 1) =>
            set((s) => {
              const existing = s.lines.find((l) => l.variantId === line.variantId);
              return {
                lines: existing
                  ? s.lines.map((l) =>
                      l.variantId === line.variantId ? { ...l, qty: l.qty + qty } : l,
                    )
                  : [...s.lines, { ...line, qty }],
              };
            }),
          setQty: (variantId, qty) =>
            set((s) => ({
              lines:
                qty <= 0
                  ? s.lines.filter((l) => l.variantId !== variantId)
                  : s.lines.map((l) => (l.variantId === variantId ? { ...l, qty } : l)),
            })),
          setMeta: (meta) => set((s) => ({ meta: { ...s.meta, ...meta } })),
          clear: () => set({ lines: [], meta: EMPTY_META }),
        }),
        { name: `bekuin-cart-${key}`, storage: createJSONStorage(() => localStorage) },
      ),
    );
    stores.set(key, store);
  }
  return store;
}

export const cartTotals = (lines: CartLine[]) => ({
  packs: lines.reduce((sum, l) => sum + l.qty, 0),
  total: lines.reduce((sum, l) => sum + l.qty * l.price, 0),
});

/** Pcs di keranjang per produk (untuk cek stok tersedia). */
export const cartPcsByProduct = (lines: CartLine[]) => {
  const map = new Map<string, number>();
  for (const l of lines) map.set(l.productId, (map.get(l.productId) ?? 0) + l.qty * l.packSize);
  return map;
};

/** Ongkir yang ikut ditagih: hanya admin dan hanya untuk pesanan diantar. */
export const cartDeliveryFee = (meta: CartMeta, isAdmin: boolean) =>
  isAdmin && meta.deliveryMethod === 'DELIVERY' ? (meta.deliveryFee ?? 0) : 0;
