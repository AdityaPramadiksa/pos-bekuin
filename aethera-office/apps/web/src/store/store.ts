import type { AgentEvent, AgentState, RunSummary } from '@aethera/shared';
import { create } from 'zustand';
import {
  EMPTY_RUN_STATE,
  applyEvents,
  applyRunUpdate,
  initRunState,
  type RunState,
} from './run-state';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting';
/** loading: hydrate pertama; empty: belum ada run; ready: tampil; error: gagal memuat. */
export type Phase = 'loading' | 'empty' | 'ready' | 'error';

export interface DashboardStore extends RunState {
  runs: RunSummary[];
  connection: ConnectionState;
  phase: Phase;
  error: string | null;
  filterAgentId: string | null;
  selectedAgentId: string | null;
  newRunOpen: boolean;

  resetRun: (run: RunSummary, states: AgentState[]) => void;
  ingest: (events: AgentEvent[]) => void;
  runUpdated: (run: RunSummary) => void;
  setRuns: (runs: RunSummary[]) => void;
  setConnection: (c: ConnectionState) => void;
  setPhase: (phase: Phase, error?: string | null) => void;
  setFilter: (agentId: string | null) => void;
  selectAgent: (agentId: string | null) => void;
  setNewRunOpen: (open: boolean) => void;
}

export const useDashboard = create<DashboardStore>()((set) => ({
  ...EMPTY_RUN_STATE,
  runs: [],
  connection: 'connecting',
  phase: 'loading',
  error: null,
  filterAgentId: null,
  selectedAgentId: null,
  newRunOpen: false,

  resetRun: (run, states) =>
    set({ ...initRunState(run, states), filterAgentId: null, selectedAgentId: null }),
  ingest: (events) =>
    set((s) => {
      const next = applyEvents(s, events);
      return next === s ? s : next;
    }),
  runUpdated: (run) =>
    set((s) => {
      const exists = s.runs.some((r) => r.runId === run.runId);
      const runs = exists ? s.runs.map((r) => (r.runId === run.runId ? run : r)) : [run, ...s.runs];
      return { ...applyRunUpdate(s, run), runs };
    }),
  setRuns: (runs) => set({ runs }),
  setConnection: (connection) => set({ connection }),
  setPhase: (phase, error = null) => set({ phase, error }),
  setFilter: (filterAgentId) => set({ filterAgentId }),
  selectAgent: (selectedAgentId) => set({ selectedAgentId }),
  setNewRunOpen: (newRunOpen) => set({ newRunOpen }),
}));
