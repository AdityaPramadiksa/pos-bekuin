import { pickUniqueCode, UNIQUE_CODE_MAX } from './unique-code';

describe('pickUniqueCode', () => {
  it('memilih 1–99 yang nominalnya belum dipakai order lain', () => {
    const taken = new Set([99001, 99002, 99003]);
    const code = pickUniqueCode(99000, taken, () => 0);
    expect(code).toBe(4);
    for (let i = 0; i < 200; i++) {
      const c = pickUniqueCode(99000, taken)!;
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(UNIQUE_CODE_MAX);
      expect(taken.has(99000 + c)).toBe(false);
    }
  });

  it('nominal order lain dengan total berbeda tetap dihindari', () => {
    // Order lain: total 98.990 + kode 20 = 99.010 → kode 10 untuk total 99.000 tidak boleh.
    const code = pickUniqueCode(99000, new Set([99010]), () => 9 / 98);
    expect(code).not.toBe(10);
  });

  it('null bila semua kode terpakai', () => {
    const all = new Set(Array.from({ length: UNIQUE_CODE_MAX }, (_, i) => 5000 + i + 1));
    expect(pickUniqueCode(5000, all)).toBeNull();
  });
});
