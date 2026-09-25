import { pcsByProduct, type PricedVariant, priceItems, settlePayment } from './order-pricing';

const base: Omit<PricedVariant, 'id' | 'categoryCode' | 'packSize' | 'price'> = {
  productId: 'udang',
  productName: 'Udang Keju',
  isActive: true,
  categoryActive: true,
  categoryCustomerVisible: true,
  productActive: true,
  productAvailable: true,
};
const variants = new Map<string, PricedVariant>([
  ['f6', { ...base, id: 'f6', categoryCode: 'FROZEN', packSize: 6, price: 22000 }],
  ['sm9', { ...base, id: 'sm9', categoryCode: 'SIAP_MAKAN', packSize: 9, price: 35000 }],
]);

describe('priceItems', () => {
  it('memakai harga dari DB dan menghitung subtotal', () => {
    const { items, subtotal } = priceItems(
      [
        { variantId: 'f6', qty: 2 },
        { variantId: 'sm9', qty: 1 },
      ],
      variants,
    );
    expect(items.map((i) => i.subtotal)).toEqual([44000, 35000]);
    expect(subtotal).toBe(79000);
  });

  it('menggabungkan baris varian yang sama', () => {
    const { items } = priceItems(
      [
        { variantId: 'f6', qty: 1 },
        { variantId: 'f6', qty: 2 },
      ],
      variants,
    );
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(3);
  });

  it('menolak varian nonaktif, produk habis, qty tidak valid', () => {
    expect(() => priceItems([], variants)).toThrow(/minimal/);
    expect(() => priceItems([{ variantId: 'x', qty: 1 }], variants)).toThrow(/tidak tersedia/);
    expect(() => priceItems([{ variantId: 'f6', qty: 0 }], variants)).toThrow(/Jumlah/);
    expect(() => priceItems([{ variantId: 'f6', qty: 1.5 }], variants)).toThrow(/Jumlah/);
    const habis = new Map([['f6', { ...variants.get('f6')!, productAvailable: false }]]);
    expect(() => priceItems([{ variantId: 'f6', qty: 1 }], habis)).toThrow(/sedang habis/);
  });

  it('menolak kategori yang tidak tampil ke pelanggan untuk order QR', () => {
    const hidden = new Map([['f6', { ...variants.get('f6')!, categoryCustomerVisible: false }]]);
    expect(() =>
      priceItems([{ variantId: 'f6', qty: 1 }], hidden, { customerFacing: true }),
    ).toThrow(/meja/);
    expect(() => priceItems([{ variantId: 'f6', qty: 1 }], hidden)).not.toThrow();
  });
});

describe('pcsByProduct', () => {
  it('Frozen dan Siap Makan memotong stok pcs produk yang sama', () => {
    const map = pcsByProduct([
      { productId: 'udang', qty: 2, packSize: 6 },
      { productId: 'udang', qty: 1, packSize: 9 },
    ]);
    expect(map.get('udang')).toBe(21);
  });
});

describe('settlePayment', () => {
  it('menghitung kembalian cash', () => {
    expect(settlePayment(104000, 'CASH', 110000)).toEqual({
      paidAmount: 110000,
      changeAmount: 6000,
    });
  });
  it('menolak uang kurang', () => {
    expect(() => settlePayment(104000, 'CASH', 100000)).toThrow(/kurang/);
    expect(() => settlePayment(104000, 'CASH', undefined)).toThrow(/uang/);
  });
  it('non-cash dianggap pas', () => {
    expect(settlePayment(104000, 'QRIS', undefined)).toEqual({
      paidAmount: 104000,
      changeAmount: 0,
    });
  });
});
