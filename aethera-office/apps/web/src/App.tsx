import { useEffect } from 'react';
import { AgentRoster } from '@/components/AgentRoster';
import { EventStream } from '@/components/EventStream';
import { Header } from '@/components/Header';
import { KpiRow } from '@/components/KpiRow';
import { NewRunDialog } from '@/components/NewRunDialog';
import { OfficeView } from '@/components/OfficeView';
import { RightPanel } from '@/components/RightPanel';
import { EmptyState, ErrorState, LoadingState, ReconnectBanner } from '@/components/PageStates';
import { connection } from '@/lib/connection';
import { useDashboard } from '@/store/store';

function Dashboard() {
  return (
    <>
      <KpiRow />
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[290px_minmax(0,1fr)_340px] lg:grid-rows-[minmax(380px,1fr)_300px]">
        <AgentRoster />
        <OfficeView className="lg:col-start-2" />
        <RightPanel className="lg:row-span-2" />
        <EventStream className="min-h-[300px] lg:col-span-2 lg:col-start-1 lg:row-start-2" />
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
