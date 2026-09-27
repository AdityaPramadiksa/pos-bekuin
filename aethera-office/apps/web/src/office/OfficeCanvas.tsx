import { OrbitControls, OrthographicCamera } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef, type ComponentRef } from 'react';
import { MOUSE, Vector3 } from 'three';
import { useDashboard } from '@/store/store';
import { Avatar } from './Avatar';
import { LabelProjector } from './LabelProjector';
import { Bookshelf, Desk, MeetingCorner, Plant, Room } from './Furniture';
import { deskWorldPosition, fitZoom, floorBounds, type FloorBounds } from './layout';
import { PALETTES, type ScenePalette, type SceneTheme } from './theme';

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

const ISO_AZIMUTH = Math.PI / 4;
const AZIMUTH_SWING = 0.75;

/** Kamera ortografik isometrik + OrbitControls terbatas (tetap terasa isometrik). */
function CameraRig({ b, resetKey }: { b: FloorBounds; resetKey: number }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const size = useThree((s) => s.size);
  // Objek three.js dimutasi di effect lewat get(), bukan nilai hook langsung.
  const get = useThree((s) => s.get);
  const target = useMemo(() => new Vector3(b.centerX, 0.6, b.centerZ), [b]);

  useEffect(() => {
    const camera = get().camera;
    const d = 30;
    camera.position.set(target.x + d, target.y + d * 0.82, target.z + d);
    camera.zoom = fitZoom(b, size.width, size.height);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    const c = controls.current;
    if (c) {
      c.target.copy(target);
      c.update();
      c.saveState();
    }
  }, [b, get, size.width, size.height, target, resetKey]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.12}
      minAzimuthAngle={ISO_AZIMUTH - AZIMUTH_SWING}
      maxAzimuthAngle={ISO_AZIMUTH + AZIMUTH_SWING}
      minPolarAngle={0.55}
      maxPolarAngle={1.15}
      minZoom={12}
      maxZoom={200}
      mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }}
      onChange={(e) => {
        // Batasi pan ke area lantai.
        const c = e?.target as OrbitControlsImpl | undefined;
        if (!c) return;
        const t = c.target;
        const cx = Math.min(b.maxX, Math.max(b.minX, t.x));
        const cz = Math.min(b.maxZ, Math.max(b.minZ, t.z));
        if (cx !== t.x || cz !== t.z || t.y !== 0.6) {
          const dx = cx - t.x;
          const dz = cz - t.z;
          const dy = 0.6 - t.y;
          t.set(cx, 0.6, cz);
          c.object.position.x += dx;
          c.object.position.y += dy;
          c.object.position.z += dz;
        }
      }}
    />
  );
}

/** Bagian statis kantor: tidak berlangganan ke store event, jadi tidak re-render saat event masuk. */
const StaticOffice = memo(function StaticOffice({
  b,
  desks,
  p,
}: {
  b: FloorBounds;
  desks: [number, number][];
  p: ScenePalette;
}) {
  return (
    <>
      <Room b={b} p={p} />
      {desks.map(([x, z]) => (
        <Desk key={`${x},${z}`} x={x} z={z} p={p} />
      ))}
      <Bookshelf x={b.maxX - 1.3} z={b.minZ + 0.3} p={p} />
      <MeetingCorner x={b.maxX - 1.6} z={b.maxZ - 1.6} p={p} />
      <Plant x={b.minX + 0.5} z={b.minZ + 0.5} s={1.2} />
      <Plant x={b.minX + 0.5} z={b.maxZ - 0.6} />
      <Plant x={b.centerX} z={b.minZ + 0.45} s={0.9} />
    </>
  );
});

export default function OfficeCanvas({ theme, resetKey }: { theme: SceneTheme; resetKey: number }) {
  const agents = useDashboard((s) => s.run?.agents);
  const agentOrder = useDashboard((s) => s.agentOrder);
  const b = useMemo(() => floorBounds(agents ?? []), [agents]);
  const desks = useMemo(() => (agents ?? []).map(deskWorldPosition), [agents]);
  const p = PALETTES[theme];

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onPointerMissed={() => {
        const s = useDashboard.getState();
        s.selectAgent(null);
        s.setFilter(null);
      }}
    >
      <color attach="background" args={[p.background]} />
      <OrthographicCamera makeDefault near={-100} far={200} />
      <ambientLight intensity={p.ambient} />
      <hemisphereLight args={['#ffffff', p.floor, 0.35]} />
      <directionalLight position={[8, 14, 6]} intensity={p.sun} />
      <CameraRig b={b} resetKey={resetKey} />
      <StaticOffice b={b} desks={desks} p={p} />
      {agentOrder.map((id) => (
        <Avatar key={id} agentId={id} p={p} />
      ))}
      <LabelProjector agentOrder={agentOrder} />
    </Canvas>
  );
}
