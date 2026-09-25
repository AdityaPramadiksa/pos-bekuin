import { describe, expect, it } from 'vitest';
import { calcDeliveryFee } from './delivery';

describe('calcDeliveryFee', () => {
  it('ongkir tetap bila belum mencapai batas gratis ongkir', () => {
    expect(calcDeliveryFee(90000, { deliveryFee: 10000, freeDeliveryMin: 100000 })).toBe(10000);
  });
  it('gratis ongkir bila subtotal ≥ batas', () => {
    expect(calcDeliveryFee(100000, { deliveryFee: 10000, freeDeliveryMin: 100000 })).toBe(0);
  });
  it('batas 0 = tidak ada gratis ongkir', () => {
    expect(calcDeliveryFee(5_000_000, { deliveryFee: 12000, freeDeliveryMin: 0 })).toBe(12000);
  });
});
