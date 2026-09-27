import { useMemo } from 'react';
import { useNow } from '@/hooks/useNow';
import { formatCompact, formatElapsed, formatNumber } from '@/lib/format';
import { totalUsage } from '@/store/run-state';
import { useDashboard } from '@/store/store';

function Kpi({
  label,
  value,
  sub,
  accent,
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="panel relative min-w-0 overflow-hidden px-4 py-3">
      <span
        className="absolute inset-y-3 left-0 w-[3px] rounded-r"
        style={{ background: accent }}
      />
      <div className="label-caps">{label}</div>
      <div className="mt-1 truncate font-mono text-2xl font-bold">{value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
      {children}
    </div>
  );
}

export function KpiRow() {
  const agents = useDashboard((s) => s.agents);
  const run = useDashboard((s) => s.run);
  const list = useMemo(() => Object.values(agents), [agents]);
  const usage = useMemo(() => totalUsage(agents), [agents]);
  const running = run?.status === 'running';
  const now = useNow(1000, running);

  const finished = list.filter((a) => a.status === 'done' || a.status === 'error').length;
  const active = list.filter((a) => a.status === 'working' || a.status === 'blocked').length;
  const errors = list.filter((a) => a.status === 'error').length;
  const pct = list.length ? Math.round((finished / list.length) * 100) : 0;
  const end = run?.endedAt ? Date.parse(run.endedAt) : now;
  const elapsed = run ? end - Date.parse(run.startedAt) : 0;

  return (
    <section
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      aria-label="Ringkasan run"
    >
      <Kpi label="Progres" value={`${pct}%`} accent="#8b5cf6">
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </Kpi>
      <Kpi
        label="Tugas"
        value={`${finished}/${list.length}`}
        sub={errors ? `${errors} gagal` : 'selesai'}
        accent={errors ? '#ef4444' : '#22c55e'}
      />
      <Kpi
        label="Agent aktif"
        value={`${active}/${list.length}`}
        sub="sedang bekerja"
        accent="#22d3ee"
      />
      <Kpi
        label="Token (in + out)"
        value={formatNumber(usage.inputTokens + usage.outputTokens)}
        sub={`cache baca ${formatCompact(usage.cacheReadTokens)} · tulis ${formatCompact(usage.cacheCreationTokens)}`}
        accent="#ec4899"
      />
      <Kpi
        label="Sesi"
        value={formatElapsed(elapsed)}
        sub={running ? 'berjalan' : 'total durasi'}
        accent="#f59e0b"
      />
    </section>
  );
}
