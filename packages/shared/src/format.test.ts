import { describe, expect, it } from 'vitest';
import { businessDateKey, formatOrderNo, formatRupiah, normalizeName } from './format';

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
