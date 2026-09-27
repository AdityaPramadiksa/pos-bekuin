import type { InstructionStatus } from '@aethera/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { formatClock } from '@/lib/format';
import { useDashboard } from '@/store/store';

const SUGGESTIONS = [
  {
    label: 'Ringkas hasil',
    text: 'Ringkas apa yang sudah kamu kerjakan dan file apa saja yang berubah.',
  },
  {
    label: 'Cek ulang',
    text: 'Periksa ulang hasil kerjamu, perbaiki kesalahan yang kamu temukan.',
  },
  { label: 'Tulis README', text: 'Tambahkan README.md singkat yang menjelaskan hasil kerjamu.' },
];

const STATUS_STYLE: Record<InstructionStatus, [string, string]> = {
  queued: ['Antre', '#f59e0b'],
  sent: ['Terkirim', '#22c55e'],
  failed: ['Gagal', '#ef4444'],
};

export function ManagerPanel() {
  const runId = useDashboard((s) => s.run?.runId);
  const agents = useDashboard((s) => s.agents);
  const agentOrder = useDashboard((s) => s.agentOrder);
  const instructions = useDashboard((s) => s.instructions);
  const target = useDashboard((s) => s.managerTarget);
  const setTarget = useDashboard((s) => s.setManagerTarget);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [target]);

  useEffect(() => {
    const el = listRef.current?.parentElement;
    if (el) el.scrollTop = el.scrollHeight;
  }, [instructions.length]);

  const targetAgent = target === 'all' ? null : agents[target];
  const running = targetAgent
    ? targetAgent.status === 'working' || targetAgent.status === 'blocked'
    : Object.values(agents).some((a) => a.status === 'working' || a.status === 'blocked');

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!runId || !text.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api.sendInstruction(runId, { target, text: text.trim() });
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-3 pb-2">
        <h3 className="label-caps text-accent!">Manager command layer</h3>
        <p className="mt-1 text-xs text-muted">
          Instruksi melanjutkan sesi Claude agent (<code className="font-mono">--resume</code>).
          Agent yang sedang bekerja menerimanya setelah tugas saat ini selesai.
        </p>
      </div>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3">
        <h4 className="label-caps px-1 pb-1.5">Percakapan manager</h4>
        {instructions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
            Belum ada instruksi.
          </p>
        ) : (
          <ol ref={listRef} className="flex flex-col gap-2 pb-3">
            {instructions.map((i) => {
              const [label, color] = STATUS_STYLE[i.status];
              const a = agents[i.agentId];
              return (
                <li key={i.id} className="rounded-xl border border-line bg-panel-2/60 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold" style={{ color: a?.def.color }}>
                      → {a?.def.name ?? i.agentId}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ color, background: `${color}22` }}
                    >
                      {label}
                      {i.status === 'sent' && i.mode === 'new' ? ' · sesi baru' : ''}
                    </span>
                    <time className="ml-auto font-mono text-faint">{formatClock(i.createdAt)}</time>
                  </div>
                  <p className="mt-1 text-sm break-words whitespace-pre-wrap text-ink/90">
                    {i.text}
                  </p>
                  {i.error && <p className="mt-1 text-xs text-red-300">{i.error}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <form onSubmit={(e) => void send(e)} className="flex flex-col gap-2 border-t border-line p-3">
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setText(s.text)}
              className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-ink"
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="Target instruksi"
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-sm"
          >
            <option value="all">Seluruh tim ({agentOrder.length})</option>
            {agentOrder.map((id) => (
              <option key={id} value={id}>
                {agents[id]?.def.name ?? id}
              </option>
            ))}
          </select>
        </div>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
          }}
          rows={3}
          maxLength={10_000}
          placeholder="Apa yang harus dikerjakan? (Ctrl+Enter untuk kirim)"
          aria-label="Instruksi"
          className="resize-y rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
        />
        {running && (
          <p className="text-[11px] text-amber-200/90">
            {targetAgent
              ? `${targetAgent.def.name} sedang bekerja — instruksi akan diantrekan.`
              : 'Sebagian agent sedang bekerja — instruksi untuk mereka akan diantrekan.'}
          </p>
        )}
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="rounded-lg bg-gradient-to-r from-accent to-accent-2 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? 'Mengirim…' : 'Kirim ↗'}
        </button>
        {error && <p className="text-xs text-red-300">{error}</p>}
      </form>
    </div>
  );
}
