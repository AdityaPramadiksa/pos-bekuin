import type { AgentDefinition } from '@aethera/shared';

/** Jarak dunia 3D per satu unit grid deskPosition. */
export const GRID_UNIT = 1;
/** Ruang kosong di sekeliling meja terluar. */
export const FLOOR_MARGIN = 3;

export interface FloorBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
  centerX: number;
  centerZ: number;
}

/** Batas lantai dari posisi meja; minimal 8×8 supaya kantor kecil tetap terasa ruangan. */
export function floorBounds(agents: Pick<AgentDefinition, 'deskPosition'>[]): FloorBounds {
  const xs = agents.map((a) => a.deskPosition.x * GRID_UNIT);
  const zs = agents.map((a) => a.deskPosition.z * GRID_UNIT);
  let minX = (xs.length ? Math.min(...xs) : 0) - FLOOR_MARGIN;
  let maxX = (xs.length ? Math.max(...xs) : 0) + FLOOR_MARGIN;
  let minZ = (zs.length ? Math.min(...zs) : 0) - FLOOR_MARGIN;
  let maxZ = (zs.length ? Math.max(...zs) : 0) + FLOOR_MARGIN;
  const grow = (min: number, max: number): [number, number] => {
    const lack = 8 - (max - min);
    return lack > 0 ? [min - lack / 2, max + lack / 2] : [min, max];
  };
  [minX, maxX] = grow(minX, maxX);
  [minZ, maxZ] = grow(minZ, maxZ);
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

export function deskWorldPosition(agent: Pick<AgentDefinition, 'deskPosition'>): [number, number] {
  return [agent.deskPosition.x * GRID_UNIT, agent.deskPosition.z * GRID_UNIT];
}

/** Zoom kamera ortografik agar seluruh lantai isometrik muat di kanvas. */
export function fitZoom(bounds: FloorBounds, viewW: number, viewH: number): number {
  const span = (bounds.width + bounds.depth) * Math.SQRT1_2;
  const zoomW = viewW / (span * 0.92);
  const zoomH = viewH / (span * 0.5 + 2.4);
  return Math.max(12, Math.min(zoomW, zoomH));
}

/** Potong teks aktivitas untuk label di atas kepala. */
export function shortLabel(text: string, max = 40): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}
