import { describe, expect, it } from 'vitest';
import { fitZoom, floorBounds, shortLabel } from '../src/office/layout';

describe('floorBounds', () => {
  it('lantai mengikuti meja terluar + margin', () => {
    const b = floorBounds([{ deskPosition: { x: -3, z: -2 } }, { deskPosition: { x: 1, z: 2 } }]);
    expect(b).toMatchObject({
      minX: -6,
      maxX: 4,
      minZ: -5,
      maxZ: 5,
      width: 10,
      depth: 10,
      centerX: -1,
      centerZ: 0,
    });
  });

  it('minimal 8×8 walau hanya satu meja atau kosong', () => {
    expect(floorBounds([{ deskPosition: { x: 0, z: 0 } }])).toMatchObject({
      width: 8,
      depth: 8,
      centerX: 0,
    });
    expect(floorBounds([])).toMatchObject({ width: 8, depth: 8 });
  });
});

describe('fitZoom & shortLabel', () => {
  it('zoom lebih besar untuk kanvas lebih besar, tidak di bawah 12', () => {
    const b = floorBounds([{ deskPosition: { x: 0, z: 0 } }]);
    expect(fitZoom(b, 1200, 600)).toBeGreaterThan(fitZoom(b, 600, 300));
    expect(fitZoom(b, 10, 10)).toBe(12);
  });

  it('memotong label ke 40 karakter', () => {
    expect(shortLabel('a'.repeat(50))).toHaveLength(40);
    expect(shortLabel('  Mengedit   src/main.ts ')).toBe('Mengedit src/main.ts');
  });
});
