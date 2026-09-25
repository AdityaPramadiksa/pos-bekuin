import { describe, expect, it } from 'vitest';
import {
  completeActionLabel,
  finalStage,
  isUnpaid,
  orderStage,
  summarizeProcessing,
} from './fulfillment';

const base = { status: 'PAID', fulfillmentStatus: 'PROCESSING', deliveryMethod: null } as const;

describe('orderStage', () => {
  it('menunggu → diproses → status akhir sesuai jenis order', () => {
    expect(orderStage({ ...base, status: 'PENDING', source: 'POS' })).toBe('PENDING');
    expect(orderStage({ ...base, source: 'ONLINE', deliveryMethod: 'DELIVERY' })).toBe(
      'PROCESSING',
    );
    const done = { ...base, fulfillmentStatus: 'DONE' } as const;
    expect(orderStage({ ...done, source: 'ONLINE', deliveryMethod: 'DELIVERY' })).toBe('SHIPPED');
    expect(orderStage({ ...done, source: 'ONLINE', deliveryMethod: 'PICKUP' })).toBe(
      'READY_PICKUP',
    );
    expect(orderStage({ ...done, source: 'QR_TABLE' })).toBe('READY_PICKUP');
    expect(orderStage({ ...done, source: 'POS' })).toBe('DONE');
    expect(orderStage({ ...done, source: 'WA_IMPORT' })).toBe('DONE');
    expect(orderStage({ ...done, status: 'VOIDED', source: 'POS' })).toBe('VOIDED');
  });

  it('teks tombol Selesai mengikuti status akhir', () => {
    expect(completeActionLabel({ source: 'ONLINE', deliveryMethod: 'DELIVERY' })).toBe(
      'Tandai dikirim',
    );
    expect(completeActionLabel({ source: 'ONLINE', deliveryMethod: 'PICKUP' })).toBe(
      'Siap diambil',
    );
    expect(completeActionLabel({ source: 'ADMIN', deliveryMethod: null })).toBe('Selesai');
    expect(finalStage({ source: 'POS', deliveryMethod: null })).toBe('DONE');
  });

  it('belum dibayar hanya untuk order disetujui tanpa paidAt', () => {
    expect(isUnpaid({ status: 'PAID', paidAt: null })).toBe(true);
    expect(isUnpaid({ status: 'PAID', paidAt: '2026-09-25T01:00:00Z' })).toBe(false);
    expect(isUnpaid({ status: 'PENDING', paidAt: null })).toBe(false);
  });
});

describe('summarizeProcessing', () => {
  const item = (productId: string, categoryCode: string, packSize: number, qty: number) => ({
    productId,
    productName: productId === 'a' ? 'Dimsum Ayam' : 'Risol Mayo',
    categoryCode,
    packSize,
    qty,
  });

  it('menjumlahkan pack & pcs per produk, kategori, dan isi', () => {
    const s = summarizeProcessing([
      { items: [item('a', 'FROZEN', 6, 2), item('b', 'SIAP_MAKAN', 6, 1)] },
      { items: [item('a', 'FROZEN', 6, 1), item('a', 'FROZEN', 9, 1)] },
      { items: [item('a', 'SIAP_MAKAN', 6, 1)] },
    ]);
    expect(s).toMatchObject({ orders: 3, packs: 6, pcs: 6 * 3 + 9 + 6 + 6, fryPacks: 2 });
    expect(s.rows[0]).toEqual({
      productId: 'a',
      productName: 'Dimsum Ayam',
      pcs: 18 + 9 + 6,
      packs: 5,
      lines: [
        { categoryCode: 'FROZEN', packSize: 6, packs: 3 },
        { categoryCode: 'FROZEN', packSize: 9, packs: 1 },
        { categoryCode: 'SIAP_MAKAN', packSize: 6, packs: 1 },
      ],
    });
    expect(s.rows[1]).toMatchObject({ productId: 'b', pcs: 6, packs: 1 });
  });

  it('kosong → nol', () => {
    expect(summarizeProcessing([])).toEqual({ orders: 0, packs: 0, pcs: 0, fryPacks: 0, rows: [] });
  });
});
