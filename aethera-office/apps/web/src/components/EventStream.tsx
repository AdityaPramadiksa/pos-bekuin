import { describeEvent, type AgentEvent } from '@aethera/shared';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatClock } from '@/lib/format';
import { useDashboard } from '@/store/store';

const TYPE_ICON: Record<AgentEvent['type'], string> = {
  'agent.session_start': '▶',
  'agent.tool_pre': '⚙',
  'agent.tool_post': '✓',
  'agent.message': '💬',
  'agent.status_change': '◆',
  'agent.session_end': '■',
  'agent.error': '⚠',
};

/** Tampilkan di stream hanya event yang bermakna bagi manusia. */
function visible(e: AgentEvent): boolean {
  // tool_post sukses sudah tersirat dari tool_pre; hanya kegagalan yang ditampilkan.
  return !(e.type === 'agent.tool_post' && e.payload.success);
}

const NEAR_BOTTOM_PX = 48;

export function EventStream({ className = '' }: { className?: string }) {
  const events = useDashboard((s) => s.events);
  const agents = useDashboard((s) => s.agents);
  const agentOrder = useDashboard((s) => s.agentOrder);
  const filter = useDashboard((s) => s.filterAgentId);
  const setFilter = useDashboard((s) => s.setFilter);

  const rows = useMemo(
    () => events.filter((e) => visible(e) && (!filter || e.agentId === filter)),
    [events, filter],
  );

  const listRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const seenCountRef = useRef(rows.length);
  const [unseen, setUnseen] = useState(0);

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stickRef.current = true;
    seenCountRef.current = rows.length;
    setUnseen(0);
  };

  // Auto-scroll hanya bila pengguna sedang di bawah; kalau sedang membaca ke atas, hitung event baru.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
      seenCountRef.current = rows.length;
      setUnseen(0);
    } else {
      setUnseen(Math.max(0, rows.length - seenCountRef.current));
    }
  }, [rows]);

  // Ganti filter → lompat ke bawah.
  useLayoutEffect(() => {
    stickRef.current = true;
  }, [filter]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickRef.current = atBottom;
    if (atBottom) {
      seenCountRef.current = rows.length;
      setUnseen(0);
    }
  };

  const last = events.at(-1);

  return (
    <section
      className={`panel relative flex min-h-0 flex-col ${className}`}
      aria-label="Aktivitas langsung"
    >
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
        <div className="mr-2">
          <div className="label-caps text-accent-2!">Event stream</div>
          <h2 className="text-sm font-bold tracking-wide">AKTIVITAS LANGSUNG</h2>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter agent">
          <FilterChip active={!filter} onClick={() => setFilter(null)}>
            Semua
          </FilterChip>
          {agentOrder.map((id) => {
            const a = agents[id];
            if (!a) return null;
            return (
              <FilterChip
                key={id}
                active={filter === id}
                color={a.def.color}
                onClick={() => setFilter(filter === id ? null : id)}
              >
                {a.def.name}
              </FilterChip>
            );
          })}
        </div>
        {last && (
          <span className="ml-auto font-mono text-[11px] text-faint">
            Event terakhir {formatClock(last.timestamp)}
          </span>
        )}
      </div>

      <div
        ref={listRef}
        onScroll={onScroll}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3"
        aria-live="polite"
        aria-relevant="additions"
      >
        {rows.length === 0 ? (
          <p className="grid h-full min-h-24 place-items-center text-sm text-muted">
            {filter ? 'Belum ada aktivitas dari agent ini.' : 'Belum ada aktivitas.'}
          </p>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {rows.map((e) => {
              const a = agents[e.agentId];
              const bad =
                e.type === 'agent.error' ||
                (e.type === 'agent.tool_post' && !e.payload.success) ||
                (e.type === 'agent.status_change' && e.payload.to === 'error');
              return (
                <li
                  key={e.id}
                  className="grid grid-cols-[64px_18px_minmax(0,110px)_1fr] items-start gap-2 rounded-lg border border-line/60 bg-panel-2/60 px-3 py-2 text-[13px]"
                  style={bad ? { borderColor: '#ef444480', background: '#ef444414' } : undefined}
                >
                  <time
                    className="font-mono text-[11px] leading-5 text-faint"
                    dateTime={e.timestamp}
                  >
                    {formatClock(e.timestamp)}
                  </time>
                  <span aria-hidden className="leading-5">
                    {TYPE_ICON[e.type]}
                  </span>
                  <span
                    className="truncate leading-5 font-semibold"
                    style={{ color: a?.def.color }}
                  >
                    {a?.def.name ?? e.agentId}
                  </span>
                  <span className="min-w-0 leading-5 break-words text-ink/85">
                    {describeEvent(e)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {unseen > 0 && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white shadow-lg"
        >
          {unseen} event baru ↓
        </button>
      )}
    </section>
  );
}

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
      style={{
        borderColor: active ? '#8b5cf6' : 'var(--color-line)',
        background: active ? '#8b5cf6' : 'transparent',
        color: active ? '#fff' : 'var(--color-muted)',
      }}
    >
      {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
      {children}
    </button>
  );
}
