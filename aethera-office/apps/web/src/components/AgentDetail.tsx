import { describeEvent } from '@aethera/shared';
import { useState } from 'react';
import { api } from '@/lib/api';
import { formatClock, formatNumber } from '@/lib/format';
import { useDashboard } from '@/store/store';
import { StatusBadge } from './StatusBadge';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="label-caps">{label}</div>
      <div className="mt-1 text-sm break-words">{children}</div>
    </div>
  );
}

export function AgentDetail({ className = '' }: { className?: string }) {
  const agent = useDashboard((s) => (s.selectedAgentId ? s.agents[s.selectedAgentId] : undefined));
  const runId = useDashboard((s) => s.run?.runId);
  const selectAgent = useDashboard((s) => s.selectAgent);
  const setManagerTarget = useDashboard((s) => s.setManagerTarget);
  const setRightTab = useDashboard((s) => s.setRightTab);
  const setFilter = useDashboard((s) => s.setFilter);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);

  if (!agent || !runId) {
    return (
      <section className={`grid flex-1 place-items-center p-6 text-center ${className}`}>
        <div>
          <div className="text-3xl" aria-hidden>
            👆
          </div>
          <p className="mt-2 text-sm text-muted">Pilih agent untuk melihat detailnya.</p>
        </div>
      </section>
    );
  }

  const running = agent.status === 'working' || agent.status === 'blocked';
  const onStop = async () => {
    setStopping(true);
    setStopError(null);
    try {
      await api.stopAgent(runId, agent.def.id);
    } catch (err) {
      setStopError(err instanceof Error ? err.message : String(err));
    } finally {
      setStopping(false);
    }
  };

  return (
    <section
      className={`panel flex min-h-0 flex-col ${className}`}
      aria-label={`Detail ${agent.def.name}`}
    >
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span
          className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
          style={{ background: agent.def.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{agent.def.name}</h2>
          <p className="truncate text-xs text-muted">{agent.def.role}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            selectAgent(null);
            setFilter(null);
          }}
          className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:text-ink"
          aria-label="Tutup detail"
        >
          ×
        </button>
      </div>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <StatusBadge status={agent.status} />
            {agent.statusReason && (
              <div className="mt-1 text-xs text-muted">{agent.statusReason}</div>
            )}
          </Field>
          <Field label="Tool aktif">{agent.activeTool ?? '—'}</Field>
        </div>
        <Field label="Tugas">
          <p className="line-clamp-4 text-ink/85" title={agent.task}>
            {agent.task || '—'}
          </p>
        </Field>
        <Field label="Aktivitas terakhir">
          <p className="text-ink/85">{agent.typing || agent.lastActivity || '—'}</p>
        </Field>
        <Field label="Token">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs">
            <dt className="text-muted">input</dt>
            <dd className="text-right">{formatNumber(agent.usage.inputTokens)}</dd>
            <dt className="text-muted">output</dt>
            <dd className="text-right">{formatNumber(agent.usage.outputTokens)}</dd>
            <dt className="text-muted">cache baca</dt>
            <dd className="text-right">{formatNumber(agent.usage.cacheReadTokens)}</dd>
            <dt className="text-muted">cache tulis</dt>
            <dd className="text-right">{formatNumber(agent.usage.cacheCreationTokens)}</dd>
          </dl>
        </Field>
        <Field label="Timeline">
          {agent.recent.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-3 text-center text-xs text-muted">
              Belum ada aktivitas.
            </p>
          ) : (
            <ol className="flex flex-col gap-1">
              {[...agent.recent].reverse().map((e) => (
                <li key={e.id} className="grid grid-cols-[58px_1fr] gap-2 text-xs">
                  <time className="font-mono text-faint">{formatClock(e.timestamp)}</time>
                  <span className="line-clamp-2 text-ink/80">{describeEvent(e)}</span>
                </li>
              ))}
            </ol>
          )}
        </Field>
        {agent.sessionId && (
          <Field label="Sesi Claude">
            <code className="font-mono text-[11px] break-all text-muted">{agent.sessionId}</code>
          </Field>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line p-3">
        <button
          type="button"
          onClick={() => {
            setManagerTarget(agent.def.id);
            setRightTab('manager');
          }}
          className="w-full rounded-lg border border-accent/60 bg-accent/10 py-2 text-sm font-semibold text-violet-200 hover:bg-accent/20"
        >
          Beri instruksi ke {agent.def.name}
        </button>
        {running && (
          <button
            type="button"
            disabled={stopping}
            onClick={() => void onStop()}
            className="w-full rounded-lg border border-bad/60 bg-bad/10 py-2 text-sm font-semibold text-red-300 hover:bg-bad/20 disabled:opacity-60"
          >
            {stopping ? 'Menghentikan…' : 'Hentikan agent'}
          </button>
        )}
        {stopError && <p className="text-xs text-red-300">{stopError}</p>}
      </div>
    </section>
  );
}
