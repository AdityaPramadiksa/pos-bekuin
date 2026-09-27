import { useDashboard, type RightTab } from '@/store/store';
import { AgentDetail } from './AgentDetail';
import { ManagerPanel } from './ManagerPanel';
import { RoadmapPanel } from './RoadmapPanel';

const TABS: { id: RightTab; label: string }[] = [
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'manager', label: 'Manager' },
  { id: 'detail', label: 'Detail agent' },
];

export function RightPanel({ className = '' }: { className?: string }) {
  const tab = useDashboard((s) => s.rightTab);
  const setTab = useDashboard((s) => s.setRightTab);
  const queued = useDashboard((s) => s.instructions.filter((i) => i.status === 'queued').length);

  return (
    <section className={`panel flex min-h-[480px] flex-col overflow-hidden ${className}`}>
      <div className="grid grid-cols-3 gap-1 border-b border-line p-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="relative rounded-full px-2 py-2 text-xs font-bold tracking-wide uppercase transition-colors"
            style={
              tab === t.id
                ? { background: 'linear-gradient(90deg,#8b5cf6,#ec4899)', color: '#fff' }
                : { color: 'var(--color-muted)' }
            }
          >
            {t.label}
            {t.id === 'manager' && queued > 0 && (
              <span className="absolute -top-1 -right-0.5 rounded-full bg-warn px-1.5 text-[10px] text-black">
                {queued}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col" role="tabpanel">
        {tab === 'roadmap' && <RoadmapPanel />}
        {tab === 'manager' && <ManagerPanel />}
        {tab === 'detail' && <AgentDetail />}
      </div>
    </section>
  );
}
