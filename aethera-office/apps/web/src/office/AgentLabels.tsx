import { plainText } from '@aethera/shared';
import { memo } from 'react';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/status';
import { useDashboard } from '@/store/store';
import { labelRegistry } from './label-registry';
import { shortLabel } from './layout';

const AgentLabel = memo(function AgentLabel({ agentId }: { agentId: string }) {
  const agent = useDashboard((s) => s.agents[agentId]);
  const selected = useDashboard((s) => s.selectedAgentId === agentId);
  if (!agent) return null;
  const color = STATUS_COLOR[agent.status];
  const activity = plainText(agent.typing) || agent.lastActivity || STATUS_LABEL[agent.status];

  return (
    <div
      ref={(el) => {
        if (el) labelRegistry.set(agentId, el);
        return () => {
          labelRegistry.delete(agentId);
        };
      }}
      className="absolute top-0 left-0 flex max-w-[240px] flex-col items-center gap-0.5 text-center select-none"
      style={{ visibility: 'hidden', willChange: 'transform' }}
    >
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-bold whitespace-nowrap text-white shadow-lg"
        style={{
          background: selected ? '#8b5cf6' : 'rgba(17,15,38,0.88)',
          border: `1px solid ${color}`,
        }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {agent.def.name}
      </span>
      <span
        className="rounded-md px-2 py-0.5 text-[11px] leading-tight whitespace-nowrap text-white/95 shadow"
        style={{ background: `${color}d9` }}
      >
        {shortLabel(activity)}
      </span>
    </div>
  );
});

/** Overlay label; ditempatkan di atas Canvas dengan ukuran yang sama. */
export function AgentLabels() {
  const agentOrder = useDashboard((s) => s.agentOrder);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {agentOrder.map((id) => (
        <AgentLabel key={id} agentId={id} />
      ))}
    </div>
  );
}
