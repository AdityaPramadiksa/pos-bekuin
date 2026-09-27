import type { RoadmapItem, RoadmapStatus } from '@aethera/shared';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useDashboard } from '@/store/store';

const STATUS_TEXT: Record<RoadmapStatus, string> = {
  pending: 'Menunggu',
  in_progress: 'Dikerjakan',
  done: 'Selesai',
};

const NUMBER_BG = ['#fce7f3', '#fef3c7', '#dcfce7', '#e0f2fe', '#ede9fe'];
const NUMBER_FG = ['#be185d', '#b45309', '#15803d', '#0369a1', '#6d28d9'];

function RoadmapRow({ item, index }: { item: RoadmapItem; index: number }) {
  const agent = useDashboard((s) =>
    item.assignedAgentId ? s.agents[item.assignedAgentId] : undefined,
  );
  const [error, setError] = useState<string | null>(null);

  const patch = async (body: Parameters<typeof api.updateRoadmapItem>[1]) => {
    setError(null);
    try {
      await api.updateRoadmapItem(item.id, body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <li className="group rounded-xl border border-line bg-panel-2/60 p-3">
      <div className="flex items-start gap-3">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-mono text-sm font-bold"
          style={{ background: NUMBER_BG[index % 5], color: NUMBER_FG[index % 5] }}
        >
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold" title={item.title}>
            {item.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {agent ? agent.def.name : 'Belum ditugaskan'} · {STATUS_TEXT[item.status]}
          </p>
        </div>
        <span className="font-mono text-xs text-muted">{item.progressPct}%</span>
      </div>
      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={item.progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progres ${item.title}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${item.progressPct}%`,
            background:
              item.status === 'done'
                ? 'linear-gradient(90deg,#22c55e,#4ade80)'
                : 'linear-gradient(90deg,#8b5cf6,#ec4899)',
          }}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <select
          aria-label="Ubah status"
          value={item.status}
          onChange={(e) => void patch({ status: e.target.value as RoadmapStatus })}
          className="rounded-md border border-line bg-panel px-2 py-1 text-xs"
        >
          {(Object.keys(STATUS_TEXT) as RoadmapStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_TEXT[s]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setError(null);
            api
              .deleteRoadmapItem(item.id)
              .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
          }}
          className="ml-auto rounded-md px-2 py-1 text-xs text-muted hover:bg-bad/15 hover:text-red-300"
        >
          Hapus
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </li>
  );
}

export function RoadmapPanel() {
  const items = useDashboard((s) => s.roadmap);
  const runId = useDashboard((s) => s.run?.runId);
  const agents = useDashboard((s) => s.agents);
  const agentOrder = useDashboard((s) => s.agentOrder);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = items.filter((i) => i.status === 'done').length;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runId || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.createRoadmapItem(runId, {
        title: title.trim(),
        assignedAgentId: assignee || null,
      });
      setTitle('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h3 className="text-sm font-bold tracking-wider">ROADMAP</h3>
        <span className="rounded-full bg-accent/20 px-2 py-0.5 font-mono text-[10px] font-bold text-accent">
          LIVE
        </span>
        <span className="ml-auto font-mono text-xs text-faint">
          {done}/{items.length}
        </span>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
            Belum ada item roadmap.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {items.map((item, i) => (
              <RoadmapRow key={item.id} item={item} index={i} />
            ))}
          </ol>
        )}
        <p className="mt-2 px-1 text-[11px] leading-snug text-faint">
          Progres saat dikerjakan adalah perkiraan dari jumlah tool yang selesai (maks. 90%) —
          Claude Code tidak melaporkan persentase tugas.
        </p>
      </div>
      <form onSubmit={(e) => void add(e)} className="flex flex-col gap-2 border-t border-line p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="+ Item roadmap baru…"
          aria-label="Judul item roadmap"
          className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            aria-label="Tugaskan ke"
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-sm"
          >
            <option value="">Tanpa agent</option>
            {agentOrder.map((id) => (
              <option key={id} value={id}>
                {agents[id]?.def.name ?? id}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Tambah
          </button>
        </div>
        {error && <p className="text-xs text-red-300">{error}</p>}
      </form>
    </div>
  );
}
