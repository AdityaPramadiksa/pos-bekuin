import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { STATUS_COLOR, STATUS_LABEL } from '@/lib/status';
import { AgentLabels } from '@/office/AgentLabels';
import { loadSceneTheme, saveSceneTheme, type SceneTheme } from '@/office/theme';
import { useDashboard } from '@/store/store';

// Scene 3D dimuat terpisah supaya panel HUD tampil lebih dulu.
const OfficeCanvas = lazy(() => import('@/office/OfficeCanvas'));

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  override render() {
    if (this.state.error) return <SceneFallback reason={`Scene 3D gagal: ${this.state.error}`} />;
    return this.props.children;
  }
}

function SceneFallback({ reason }: { reason: string }) {
  return (
    <div className="grid h-full place-items-center p-6 text-center text-sm text-muted">
      <div>
        <div className="text-3xl" aria-hidden>
          🧊
        </div>
        <p className="mt-2">{reason}</p>
        <p className="mt-1 text-xs">Roster dan event stream tetap berjalan normal.</p>
      </div>
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  children,
  label,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className="rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur transition-colors"
      style={{
        borderColor: active ? '#8b5cf6' : 'rgba(255,255,255,0.15)',
        background: active ? '#8b5cf6' : 'rgba(17,15,38,0.7)',
        color: '#fff',
      }}
    >
      {children}
    </button>
  );
}

export function OfficeView({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<SceneTheme>(loadSceneTheme);
  const [resetKey, setResetKey] = useState(0);
  const [webgl] = useState(hasWebGL);
  const count = useDashboard((s) => s.agentOrder.length);

  const changeTheme = (t: SceneTheme) => {
    setTheme(t);
    saveSceneTheme(t);
  };

  return (
    <section
      className={`panel relative min-h-[380px] overflow-hidden ${className}`}
      aria-label="Kantor 3D"
    >
      {webgl ? (
        <SceneErrorBoundary>
          <Suspense fallback={<SceneFallback reason="Menyiapkan kantor 3D…" />}>
            <OfficeCanvas theme={theme} resetKey={resetKey} />
            <AgentLabels />
          </Suspense>
        </SceneErrorBoundary>
      ) : (
        <SceneFallback reason="Browser ini tidak mendukung WebGL, jadi kantor 3D tidak ditampilkan." />
      )}

      <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
        <div className="rounded-xl border border-white/10 bg-[#110f26]/85 px-3.5 py-2 backdrop-blur">
          <div className="text-sm font-bold tracking-wide text-white">LIVE OFFICE FLOOR</div>
          <div className="font-mono text-[11px] text-white/70">
            {count} agent · koordinasi real-time
          </div>
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-1.5">
          <ToolbarButton active={theme === 'light'} onClick={() => changeTheme('light')}>
            ☀ Terang
          </ToolbarButton>
          <ToolbarButton active={theme === 'dark'} onClick={() => changeTheme('dark')}>
            ☾ Gelap
          </ToolbarButton>
          <ToolbarButton onClick={() => setResetKey((k) => k + 1)}>↺ Sudut awal</ToolbarButton>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-1.5" aria-label="Legenda status">
          {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((s) => (
            <li
              key={s}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#110f26]/80 px-2 py-0.5 text-[11px] text-white/85"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]}
            </li>
          ))}
        </ul>
        <span className="rounded-full bg-[#110f26]/80 px-2.5 py-0.5 font-mono text-[10.5px] text-white/60">
          seret = putar · kanan = geser · scroll = zoom · klik agent = detail
        </span>
      </div>
    </section>
  );
}
