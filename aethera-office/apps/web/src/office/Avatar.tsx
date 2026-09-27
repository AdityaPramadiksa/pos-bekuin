import { useFrame } from '@react-three/fiber';
import { memo, useMemo, useRef } from 'react';
import { Color, type Group } from 'three';
import { STATUS_COLOR } from '@/lib/status';
import { useDashboard } from '@/store/store';
import { deskWorldPosition } from './layout';
import type { ScenePalette } from './theme';

const IDLE_GRAY = new Color('#7d7a90');

/** Warna badan per status: idle redup, working warna agent terang, lainnya warna status. */
function bodyColor(status: keyof typeof STATUS_COLOR, agentColor: string): string {
  if (status === 'working') return agentColor;
  if (status === 'idle') return `#${new Color(agentColor).lerp(IDLE_GRAY, 0.65).getHexString()}`;
  return STATUS_COLOR[status];
}

/**
 * Satu agent di kantor. Berlangganan hanya ke state agent-nya sendiri (selector per id),
 * jadi event agent lain tidak me-render ulang avatar ini. Animasi lewat useFrame + ref.
 */
export const Avatar = memo(function Avatar({ agentId, p }: { agentId: string; p: ScenePalette }) {
  const agent = useDashboard((s) => s.agents[agentId]);
  const selected = useDashboard((s) => s.selectedAgentId === agentId);
  const bodyRef = useRef<Group>(null);
  const alertRef = useRef<Group>(null);
  const status = agent?.status ?? 'idle';
  const working = status === 'working';
  const alert = status === 'blocked' || status === 'error';
  const color = agent ? bodyColor(status, agent.def.color) : '#888';
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    if (bodyRef.current) {
      bodyRef.current.position.y = working ? Math.abs(Math.sin(t * 4)) * 0.06 : 0;
      bodyRef.current.rotation.y = working ? Math.sin(t * 2) * 0.12 : 0;
    }
    if (alertRef.current) {
      alertRef.current.position.y = 1.75 + Math.sin(t * 3) * 0.06;
      alertRef.current.rotation.y = t * 1.5;
    }
  });

  if (!agent) return null;
  const [x, z] = deskWorldPosition(agent.def);

  const onSelect = () => {
    const s = useDashboard.getState();
    const next = s.selectedAgentId === agentId ? null : agentId;
    s.selectAgent(next);
    s.setFilter(next);
  };

  return (
    <group position={[x, 0, z - 0.62]}>
      {/* alas warna identitas agent + cincin status */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.42, 32]} />
        <meshBasicMaterial color={agent.def.color} transparent opacity={0.35} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.012, 0]}>
        <ringGeometry args={[selected ? 0.46 : 0.42, selected ? 0.56 : 0.47, 40]} />
        <meshBasicMaterial color={selected ? '#ffffff' : STATUS_COLOR[status]} />
      </mesh>

      <group
        ref={bodyRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
        }}
      >
        <mesh position={[0, 0.55, 0]}>
          <capsuleGeometry args={[0.22, 0.45, 6, 16]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={working ? 0.35 : alert ? 0.45 : 0.05}
          />
        </mesh>
        <mesh position={[0, 1.08, 0]}>
          <sphereGeometry args={[0.19, 20, 16]} />
          <meshStandardMaterial color={status === 'idle' ? '#bfb3a6' : p.skin} />
        </mesh>
        {/* mata menghadap kamera (+z) */}
        {[-0.07, 0.07].map((ex) => (
          <mesh key={ex} position={[ex, 1.1, 0.17]}>
            <sphereGeometry args={[0.025, 8, 8]} />
            <meshBasicMaterial color="#1f1b2e" />
          </mesh>
        ))}
      </group>

      {alert && (
        <group ref={alertRef} position={[0, 1.75, 0]}>
          <mesh position={[0, 0.12, 0]}>
            <boxGeometry args={[0.08, 0.26, 0.08]} />
            <meshBasicMaterial color={STATUS_COLOR[status]} />
          </mesh>
          <mesh position={[0, -0.1, 0]}>
            <sphereGeometry args={[0.05, 12, 12]} />
            <meshBasicMaterial color={STATUS_COLOR[status]} />
          </mesh>
        </group>
      )}
    </group>
  );
});
