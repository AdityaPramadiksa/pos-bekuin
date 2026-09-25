import type { PublicPaymentMethod } from '@bekuin/shared';

/** Urutan tampil cara bayar pelanggan: QRIS dulu (pilihan utama pesan dari meja). */
export const sortCustomerMethods = (methods: PublicPaymentMethod[]) =>
  [...methods].sort((a, b) => Number(b.type === 'QRIS') - Number(a.type === 'QRIS'));
