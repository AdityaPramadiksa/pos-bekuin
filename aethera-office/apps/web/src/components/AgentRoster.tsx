import { useCallback, useMemo } from 'react';
import { sortAgentsForRoster } from '@/store/run-state';
import { useDashboard } from '@/store/store';
import { AgentCard } from './AgentCard';

export function AgentRoster() {
  const agents = useDashboard((s) => s.agents);
  const selectedId = useDashboard((s) => s.selectedAgentId);
  const sorted = useMemo(() => sortAgentsForRoster(Object.values(agents)), [agents]);

  const onSelect = useCallback((id: string) => {
    const { selectedAgentId, selectAgent, setFilter } = useDashboard.getState();
    const next = selectedAgentId === id ? null : id;
    selectAgent(next);
    setFilter(next);
  }, []);

  return (
    <section className="panel flex min-h-0 flex-col" aria-label="Daftar agent">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h2 className="label-caps">Agent roster</h2>
        <span className="font-mono text-xs text-faint">{sorted.length}</span>
      </div>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
        {sorted.map((a) => (
          <AgentCard
            key={a.def.id}
            agent={a}
            selected={a.def.id === selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}
