import { normalizePhone, onlineDateWindow } from './online-order';

describe('onlineDateWindow', () => {
  it('toko buka: boleh hari ini sampai 14 hari ke depan', () => {
    expect(onlineDateWindow('2026-09-25', true)).toEqual({
      earliestDate: '2026-09-25',
      latestDate: '2026-10-09',
    });
  });

  it('toko tutup / di luar jam buka: paling cepat besok', () => {
    expect(onlineDateWindow('2026-09-30', false).earliestDate).toBe('2026-10-01');
  });
});

describe('normalizePhone', () => {
  it('menyamakan 08…, 628…, +62 8…', () => {
    expect(normalizePhone('0812-3456-7890')).toBe('081234567890');
    expect(normalizePhone('+62 812 3456 7890')).toBe('081234567890');
    expect(normalizePhone('6281234567890')).toBe('081234567890');
  });
});
