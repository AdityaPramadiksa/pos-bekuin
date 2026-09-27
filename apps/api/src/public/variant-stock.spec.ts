import { variantStock } from './public.service';
import { payDeadline } from '../orders/unpaid-orders.service';

describe('variantStock (stok di menu pelanggan)', () => {
  const p = (availablePcs: number, isAvailable = true) => ({ availablePcs, isAvailable });

  it('tersedia bila cukup untuk ≥ 3 pack', () => {
    expect(variantStock(p(18), 6, 'online')).toEqual({ available: true, stockLevel: 'OK' });
  });

  it('terbatas bila kurang dari 3 pack', () => {
    expect(variantStock(p(17), 6, 'online')).toEqual({ available: true, stockLevel: 'LIMITED' });
    expect(variantStock(p(6), 6, 'table')).toEqual({ available: true, stockLevel: 'LIMITED' });
  });

  it('habis hari ini: QR meja tidak bisa pesan, link online masih bisa pre-order', () => {
    expect(variantStock(p(5), 6, 'table')).toEqual({ available: false, stockLevel: 'SOLD_OUT' });
    expect(variantStock(p(5), 6, 'online')).toEqual({ available: true, stockLevel: 'SOLD_OUT' });
    // Pack besar habis, pack kecil masih ada.
    expect(variantStock(p(8), 9, 'table').stockLevel).toBe('SOLD_OUT');
    expect(variantStock(p(8), 6, 'table').stockLevel).toBe('LIMITED');
  });

  it('toggle "Habis" manual menutup semua saluran', () => {
    expect(variantStock(p(100, false), 6, 'online')).toEqual({
      available: false,
      stockLevel: 'SOLD_OUT',
    });
  });
});

describe('payDeadline', () => {
  it('jam dibuat + batas jam; 0 = tanpa batas', () => {
    const createdAt = new Date('2026-09-27T02:00:00Z');
    expect(payDeadline({ createdAt }, 24)?.toISOString()).toBe('2026-09-28T02:00:00.000Z');
    expect(payDeadline({ createdAt }, 0)).toBeNull();
  });
});
