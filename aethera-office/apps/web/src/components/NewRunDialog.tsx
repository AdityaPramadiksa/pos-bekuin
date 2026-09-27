import { MAX_AGENTS_PER_RUN, TASK_MAX } from '@aethera/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { connection } from '@/lib/connection';
import { TEAM_PRESETS, type TeamPreset } from '@/presets';
import { useDashboard } from '@/store/store';

interface Draft {
  include: boolean;
  task: string;
}

function draftsFor(preset: TeamPreset): Record<string, Draft> {
  return Object.fromEntries(
    preset.agents.map((a) => [a.id, { include: true, task: a.defaultTask }]),
  );
}

export function NewRunDialog() {
  const open = useDashboard((s) => s.newRunOpen);
  const setOpen = useDashboard((s) => s.setNewRunOpen);
  const [presetId, setPresetId] = useState(TEAM_PRESETS[0]!.id);
  const preset = TEAM_PRESETS.find((p) => p.id === presetId) ?? TEAM_PRESETS[0]!;
  const [drafts, setDrafts] = useState(() => draftsFor(preset));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const chosen = preset.agents.filter((a) => drafts[a.id]?.include);
  const valid = chosen.length > 0 && chosen.every((a) => drafts[a.id]!.task.trim().length > 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    setError(null);
    try {
      const run = await api.startRun({
        agents: chosen.map(({ defaultTask: _d, ...def }) => def),
        tasks: Object.fromEntries(chosen.map((a) => [a.id, drafts[a.id]!.task.trim()])),
      });
      setOpen(false);
      await connection.selectRun(run.runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-run-title"
        onSubmit={(e) => void submit(e)}
        className="panel flex max-h-[90vh] w-full max-w-2xl flex-col"
      >
        <div className="border-b border-line px-5 py-4">
          <h2 id="new-run-title" className="text-lg font-bold">
            Mulai run baru
          </h2>
          <p className="mt-1 text-xs text-muted">
            Tiap agent menjalankan <code className="font-mono">claude -p</code> dengan login
            langganan di mesin ini, di folder kerjanya sendiri. Maks. {MAX_AGENTS_PER_RUN} agent.
          </p>
        </div>

        <div className="scroll-thin flex flex-col gap-4 overflow-y-auto px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="label-caps">Preset tim</span>
            <select
              ref={firstFieldRef}
              value={presetId}
              onChange={(e) => {
                const next = TEAM_PRESETS.find((p) => p.id === e.target.value)!;
                setPresetId(next.id);
                setDrafts(draftsFor(next));
              }}
              className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
            >
              {TEAM_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.agents.length} agent)
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">{preset.description}</span>
          </label>

          {preset.agents.map((a) => {
            const d = drafts[a.id]!;
            return (
              <fieldset
                key={a.id}
                className="rounded-xl border border-line p-3"
                style={{ opacity: d.include ? 1 : 0.55 }}
              >
                <legend className="px-1">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={d.include}
                      onChange={(e) =>
                        setDrafts({ ...drafts, [a.id]: { ...d, include: e.target.checked } })
                      }
                    />
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
                    {a.name} <span className="font-normal text-muted">· {a.role}</span>
                  </label>
                </legend>
                <textarea
                  aria-label={`Tugas ${a.name}`}
                  value={d.task}
                  disabled={!d.include}
                  maxLength={TASK_MAX}
                  rows={3}
                  onChange={(e) => setDrafts({ ...drafts, [a.id]: { ...d, task: e.target.value } })}
                  className="w-full resize-y rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
                  placeholder="Tulis tugas untuk agent ini"
                />
              </fieldset>
            );
          })}
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-bad/50 bg-bad/10 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-line px-4 py-2 text-sm"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={!valid || submitting}
            className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? 'Memulai…' : `Mulai ${chosen.length} agent`}
          </button>
        </div>
      </form>
    </div>
  );
}
