import { useEffect } from 'react';
import { AgentDetail } from '@/components/AgentDetail';
import { AgentRoster } from '@/components/AgentRoster';
import { EventStream } from '@/components/EventStream';
import { Header } from '@/components/Header';
import { KpiRow } from '@/components/KpiRow';
import { NewRunDialog } from '@/components/NewRunDialog';
import { EmptyState, ErrorState, LoadingState, ReconnectBanner } from '@/components/PageStates';
import { connection } from '@/lib/connection';
import { useDashboard } from '@/store/store';

function Dashboard() {
  return (
    <>
      <KpiRow />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)_340px]">
        <AgentRoster />
        <EventStream className="min-h-[420px]" />
        <AgentDetail />
      </div>
    </>
  );
}

export function App() {
  const phase = useDashboard((s) => s.phase);
  useEffect(() => connection.start(), []);

  return (
    <div className="mx-auto flex h-full max-w-[1800px] flex-col gap-3 p-3 lg:p-4">
      <Header />
      <ReconnectBanner />
      {phase === 'loading' && <LoadingState />}
      {phase === 'empty' && <EmptyState />}
      {phase === 'error' && <ErrorState />}
      {phase === 'ready' && <Dashboard />}
      <NewRunDialog />
    </div>
  );
}
