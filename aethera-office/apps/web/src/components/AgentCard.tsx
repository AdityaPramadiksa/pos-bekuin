import { plainText } from '@aethera/shared';
import { memo } from 'react';
import { formatCompact } from '@/lib/format';
import { STATUS_COLOR } from '@/lib/status';
import type { AgentView } from '@/store/run-state';
import { StatusBadge } from './StatusBadge';

export const AgentCard = memo(function AgentCard({
  agent,
  selected,
  onSelect,
}: {
  agent: AgentView;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const alert = agent.status === 'error' || agent.status === 'blocked';
  const color = STATUS_COLOR[agent.status];
  const activity = agent.typing
    ? `✎ ${plainText(agent.typing)}`
    : agent.lastActivity || (agent.status === 'idle' ? 'Belum ada aktivitas' : '');
  const tokens = agent.usage.inputTokens + agent.usage.outputTokens;

  return (
    <button
      type="button"
      onClick={() => onSelect(agent.def.id)}
      aria-pressed={selected}
      className="w-full rounded-xl border p-3 text-left transition-colors hover:bg-panel-2"
      style={{
        borderColor: selected ? '#8b5cf6' : alert ? `${color}99` : 'var(--color-line)',
        background: alert ? `${color}14` : undefined,
        boxShadow: alert ? `inset 3px 0 0 ${color}` : undefined,
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold text-white"
          style={{ background: agent.def.color }}
          aria-hidden
        >
          {agent.def.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{agent.def.name}</div>
          <div className="truncate text-xs text-muted">{agent.def.role}</div>
        </div>
        <StatusBadge status={agent.status} />
      </div>
      <p
        className="mt-2 line-clamp-2 min-h-[2.5em] text-[13px] leading-snug"
        style={{ color: agent.status === 'error' ? '#fca5a5' : 'var(--color-muted)' }}
        title={activity}
      >
        {activity}
      </p>
      <div className="mt-1.5 flex items-center gap-2 font-mono text-[11px] text-faint">
        {agent.activeTool && (
          <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">{agent.activeTool}</span>
        )}
        <span className="ml-auto">{formatCompact(tokens)} tok</span>
      </div>
    </button>
  );
});
