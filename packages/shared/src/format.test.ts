import { describe, expect, it } from 'vitest';
import {
  businessDateKey,
  formatOrderNo,
  formatRupiah,
  normalizeName,
  quickCashAmounts,
  whatsappNumber,
} from './format';

describe('format', () => {
  it('memformat rupiah tanpa desimal', () => {
    expect(formatRupiah(104000)).toBe('Rp104.000');
  });

  it('memakai tanggal WITA untuk nomor order', () => {
    // 21 Sep 2026 17:30 UTC = 22 Sep 2026 01:30 WITA
    const date = new Date('2026-09-21T17:30:00Z');
    expect(businessDateKey(date)).toBe('2026-09-22');
    expect(formatOrderNo(date, 12)).toBe('BK-20260922-0012');
  });

  it('menormalkan nama', () => {
    expect(normalizeName('  Bu   Sri ')).toBe('bu sri');
  });
});

describe('quickCashAmounts', () => {
  it('uang pas lalu pecahan umum di atas total', () => {
    expect(quickCashAmounts(104000)).toEqual([104000, 110000, 120000, 150000]);
    expect(quickCashAmounts(22000)).toEqual([22000, 30000, 40000, 50000]);
    expect(quickCashAmounts(50000)).toEqual([50000, 60000, 100000]);
  });

  it('mengubah nomor WA lokal ke format wa.me', () => {
    expect(whatsappNumber('0812-3456-7890')).toBe('6281234567890');
    expect(whatsappNumber('+62 812 3456 7890')).toBe('6281234567890');
    expect(whatsappNumber('81234567890')).toBe('6281234567890');
    expect(whatsappNumber('')).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
    expect(whatsappNumber('0812')).toBeNull();
  });
});
