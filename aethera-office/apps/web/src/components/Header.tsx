import { connection } from '@/lib/connection';
import { formatDateTime } from '@/lib/format';
import { RUN_STATUS_COLOR, RUN_STATUS_LABEL } from '@/lib/status';
import { useDashboard } from '@/store/store';

function LiveIndicator() {
  const state = useDashboard((s) => s.connection);
  const map = {
    connected: { label: 'Live', color: '#22c55e' },
    connecting: { label: 'Menghubungkan…', color: '#9591bd' },
    reconnecting: { label: 'Menyambung ulang…', color: '#f59e0b' },
  } as const;
  const { label, color } = map[state];
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm font-medium"
      role="status"
    >
      <span
        className={state === 'connected' ? 'pulse-dot' : undefined}
        style={{ width: 8, height: 8, borderRadius: 999, background: color }}
      />
      {label}
    </span>
  );
}

export function Header() {
  const runs = useDashboard((s) => s.runs);
  const run = useDashboard((s) => s.run);
  const setNewRunOpen = useDashboard((s) => s.setNewRunOpen);

  return (
    <header className="panel flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className="grid h-10 w-10 place-items-center rounded-xl text-lg font-black text-white"
          style={{ background: 'linear-gradient(135deg,#f59e0b,#ec4899 45%,#8b5cf6)' }}
          aria-hidden
        >
          A
        </div>
        <div className="leading-tight">
          <div className="text-lg font-extrabold tracking-wide">
            AETHERA <span className="text-accent">OFFICE</span>
          </div>
          <div className="text-xs text-muted">Kantor virtual agent Claude Code</div>
        </div>
      </div>

      <label className="ml-2 flex min-w-0 items-center gap-2">
        <span className="label-caps">Run</span>
        <select
          className="max-w-[320px] min-w-0 rounded-lg border border-line bg-panel-2 px-3 py-1.5 font-mono text-sm"
          value={run?.runId ?? ''}
          onChange={(e) => void connection.selectRun(e.target.value)}
          disabled={runs.length === 0}
        >
          {runs.length === 0 && <option value="">Belum ada run</option>}
          {runs.map((r) => (
            <option key={r.runId} value={r.runId}>
              {r.runId} · {formatDateTime(r.startedAt)} · {RUN_STATUS_LABEL[r.status]}
            </option>
          ))}
        </select>
      </label>
      {run && (
        <span
          className="rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{
            color: RUN_STATUS_COLOR[run.status],
            background: `${RUN_STATUS_COLOR[run.status]}1f`,
          }}
        >
          {RUN_STATUS_LABEL[run.status]}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <LiveIndicator />
        <button
          type="button"
          onClick={() => setNewRunOpen(true)}
          className="rounded-full bg-gradient-to-r from-accent to-accent-2 px-4 py-1.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 hover:brightness-110"
        >
          + Run baru
        </button>
      </div>
    </header>
  );
}
