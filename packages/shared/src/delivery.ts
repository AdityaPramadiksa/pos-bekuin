/** Ongkir pesanan online yang diantar: tarif tetap, gratis bila subtotal ≥ batas (0 = tidak ada). */
export function calcDeliveryFee(
  subtotal: number,
  rule: { deliveryFee: number; freeDeliveryMin: number },
): number {
  if (rule.freeDeliveryMin > 0 && subtotal >= rule.freeDeliveryMin) return 0;
  return Math.max(0, rule.deliveryFee);
}
