import type { AgentStatus } from '@aethera/shared';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/status';

export function StatusDot({ status, size = 8 }: { status: AgentStatus; size?: number }) {
  return (
    <span
      aria-hidden
      className={status === 'working' ? 'pulse-dot' : undefined}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 999,
        background: STATUS_COLOR[status],
        boxShadow: status === 'idle' ? 'none' : `0 0 8px ${STATUS_COLOR[status]}`,
        flexShrink: 0,
      }}
    />
  );
}

export function StatusBadge({ status }: { status: AgentStatus }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color, background: `${color}1f`, border: `1px solid ${color}55` }}
    >
      <StatusDot status={status} size={6} />
      {STATUS_LABEL[status]}
    </span>
  );
}
