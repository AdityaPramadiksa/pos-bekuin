import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3 } from 'three';
import { useDashboard } from '@/store/store';
import { labelRegistry } from './label-registry';
import { deskWorldPosition } from './layout';

const AVATAR_Z_OFFSET = -0.62;

/** Komponen di dalam Canvas: menulis transform tiap label. */
export function LabelProjector({ agentOrder }: { agentOrder: string[] }) {
  const size = useThree((s) => s.size);
  const v = useRef(new Vector3());

  useFrame(({ camera }) => {
    const agents = useDashboard.getState().agents;
    for (const id of agentOrder) {
      const el = labelRegistry.get(id);
      const a = agents[id];
      if (!el || !a) continue;
      const [x, z] = deskWorldPosition(a.def);
      const alert = a.status === 'blocked' || a.status === 'error';
      v.current.set(x, alert ? 2.15 : 1.5, z + AVATAR_Z_OFFSET).project(camera);
      const px = (v.current.x * 0.5 + 0.5) * size.width;
      const py = (-v.current.y * 0.5 + 0.5) * size.height;
      const visible = v.current.z < 1 && px > -100 && px < size.width + 100 && py > -60;
      el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -100%)`;
      el.style.visibility = visible ? 'visible' : 'hidden';
      // Agent yang lebih dekat ke kamera di atas.
      el.style.zIndex = String(Math.round((1 - v.current.z) * 1000));
    }
  });
  return null;
}
