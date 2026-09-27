import { memo } from 'react';
import type { FloorBounds } from './layout';
import type { ScenePalette } from './theme';

const WALL_H = 2.2;
const WALL_T = 0.15;

/** Lantai + dinding rendah di dua sisi belakang (gaya potongan isometrik). */
export const Room = memo(function Room({ b, p }: { b: FloorBounds; p: ScenePalette }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[b.centerX, 0, b.centerZ]} receiveShadow>
        <planeGeometry args={[b.width, b.depth]} />
        <meshStandardMaterial color={p.floor} />
      </mesh>
      {/* garis papan lantai */}
      {Array.from({ length: Math.floor(b.width) - 1 }, (_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[b.minX + i + 1, 0.002, b.centerZ]}>
          <planeGeometry args={[0.02, b.depth]} />
          <meshBasicMaterial color={p.floorLine} />
        </mesh>
      ))}
      {/* tepi lantai */}
      <mesh position={[b.centerX, -0.1, b.centerZ]}>
        <boxGeometry args={[b.width + 0.3, 0.2, b.depth + 0.3]} />
        <meshStandardMaterial color={p.wallTrim} />
      </mesh>
      {/* dinding belakang (sisi -z) dan kiri (sisi -x) */}
      <mesh position={[b.centerX, WALL_H / 2, b.minZ - WALL_T / 2]}>
        <boxGeometry args={[b.width + WALL_T * 2, WALL_H, WALL_T]} />
        <meshStandardMaterial color={p.wall} />
      </mesh>
      <mesh position={[b.minX - WALL_T / 2, WALL_H / 2, b.centerZ]}>
        <boxGeometry args={[WALL_T, WALL_H, b.depth]} />
        <meshStandardMaterial color={p.wall} />
      </mesh>
      {/* jendela di dinding belakang */}
      {[-0.25, 0.25].map((f) => (
        <group key={f} position={[b.centerX + f * b.width, 1.3, b.minZ + 0.01]}>
          <mesh>
            <planeGeometry args={[b.width * 0.3, 1]} />
            <meshStandardMaterial color={p.window} emissive={p.window} emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[0, 0, 0.01]}>
            <planeGeometry args={[0.05, 1]} />
            <meshStandardMaterial color={p.wallTrim} />
          </mesh>
        </group>
      ))}
    </group>
  );
});

export const Desk = memo(function Desk({ x, z, p }: { x: number; z: number; p: ScenePalette }) {
  const legs: [number, number][] = [
    [-0.62, -0.32],
    [0.62, -0.32],
    [-0.62, 0.32],
    [0.62, 0.32],
  ];
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.74, 0]}>
        <boxGeometry args={[1.4, 0.06, 0.8]} />
        <meshStandardMaterial color={p.desk} />
      </mesh>
      {legs.map(([lx, lz]) => (
        <mesh key={`${lx}${lz}`} position={[lx, 0.37, lz]}>
          <boxGeometry args={[0.05, 0.74, 0.05]} />
          <meshStandardMaterial color={p.deskLeg} />
        </mesh>
      ))}
      {/* monitor menghadap agent (sisi -z) */}
      <group position={[0, 0.77, 0.12]}>
        <mesh position={[0, 0.3, 0]}>
          <boxGeometry args={[0.7, 0.42, 0.04]} />
          <meshStandardMaterial color={p.monitor} />
        </mesh>
        <mesh position={[0, 0.3, -0.021]} rotation-y={Math.PI}>
          <planeGeometry args={[0.64, 0.36]} />
          <meshStandardMaterial color={p.screen} emissive={p.screen} emissiveIntensity={0.6} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <boxGeometry args={[0.05, 0.12, 0.05]} />
          <meshStandardMaterial color={p.monitor} />
        </mesh>
      </group>
      {/* keyboard */}
      <mesh position={[0, 0.78, -0.18]}>
        <boxGeometry args={[0.45, 0.02, 0.14]} />
        <meshStandardMaterial color={p.monitor} />
      </mesh>
      {/* kursi di belakang meja */}
      <group position={[0, 0, -0.85]}>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[0.5, 0.08, 0.5]} />
          <meshStandardMaterial color={p.chair} />
        </mesh>
        <mesh position={[0, 0.75, -0.23]}>
          <boxGeometry args={[0.5, 0.55, 0.06]} />
          <meshStandardMaterial color={p.chair} />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.44, 8]} />
          <meshStandardMaterial color={p.deskLeg} />
        </mesh>
      </group>
    </group>
  );
});

export const Plant = memo(function Plant({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.2, 0.15, 0.4, 16]} />
        <meshStandardMaterial color="#c2703d" />
      </mesh>
      <mesh position={[0, 0.65, 0]}>
        <sphereGeometry args={[0.35, 16, 12]} />
        <meshStandardMaterial color="#3fae6a" />
      </mesh>
      <mesh position={[0.12, 0.95, 0.05]}>
        <sphereGeometry args={[0.22, 16, 12]} />
        <meshStandardMaterial color="#56c47f" />
      </mesh>
    </group>
  );
});

const BOOK_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

export const Bookshelf = memo(function Bookshelf({
  x,
  z,
  p,
}: {
  x: number;
  z: number;
  p: ScenePalette;
}) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[1.6, 1.8, 0.4]} />
        <meshStandardMaterial color={p.shelf} />
      </mesh>
      {[0.45, 1.0, 1.55].map((y, row) =>
        Array.from({ length: 8 }, (_, i) => (
          <mesh key={`${row}-${i}`} position={[-0.63 + i * 0.18, y, 0.12]}>
            <boxGeometry args={[0.13, 0.38 - (i % 3) * 0.05, 0.2]} />
            <meshStandardMaterial color={BOOK_COLORS[(i + row * 2) % BOOK_COLORS.length]} />
          </mesh>
        )),
      )}
    </group>
  );
});

export const MeetingCorner = memo(function MeetingCorner({
  x,
  z,
  p,
}: {
  x: number;
  z: number;
  p: ScenePalette;
}) {
  return (
    <group position={[x, 0, z]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, 0]}>
        <circleGeometry args={[1.3, 40]} />
        <meshStandardMaterial color={p.rug} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.5, 0.5, 0.05, 32]} />
        <meshStandardMaterial color={p.desk} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.05, 0.08, 0.44, 12]} />
        <meshStandardMaterial color={p.deskLeg} />
      </mesh>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.85, 0.25, Math.sin(a) * 0.85]}>
            <cylinderGeometry args={[0.22, 0.22, 0.5, 20]} />
            <meshStandardMaterial color={p.chair} />
          </mesh>
        );
      })}
    </group>
  );
});
