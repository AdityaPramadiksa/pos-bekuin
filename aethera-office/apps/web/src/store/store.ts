import type {
  AgentEvent,
  AgentState,
  ManagerInstruction,
  RoadmapItem,
  RunSummary,
} from '@aethera/shared';
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
export type RightTab = 'roadmap' | 'manager' | 'detail';

/** Sisipkan atau ganti instruksi berdasarkan id, urut waktu dibuat. */
export function upsertInstruction(
  list: ManagerInstruction[],
  item: ManagerInstruction,
): ManagerInstruction[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const next = [...list];
  next[i] = item;
  return next;
}

export interface DashboardStore extends RunState {
  runs: RunSummary[];
  connection: ConnectionState;
  phase: Phase;
  error: string | null;
  filterAgentId: string | null;
  selectedAgentId: string | null;
  newRunOpen: boolean;
  roadmap: RoadmapItem[];
  instructions: ManagerInstruction[];
  rightTab: RightTab;
  /** Target terpilih di Manager Command Layer ("all" atau id agent). */
  managerTarget: string;

  resetRun: (run: RunSummary, states: AgentState[]) => void;
  ingest: (events: AgentEvent[]) => void;
  runUpdated: (run: RunSummary) => void;
  setRuns: (runs: RunSummary[]) => void;
  setConnection: (c: ConnectionState) => void;
  setPhase: (phase: Phase, error?: string | null) => void;
  setFilter: (agentId: string | null) => void;
  selectAgent: (agentId: string | null) => void;
  setNewRunOpen: (open: boolean) => void;
  setRoadmap: (runId: string, items: RoadmapItem[]) => void;
  setInstructions: (items: ManagerInstruction[]) => void;
  instructionUpdated: (item: ManagerInstruction) => void;
  setRightTab: (tab: RightTab) => void;
  setManagerTarget: (target: string) => void;
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
  roadmap: [],
  instructions: [],
  rightTab: 'roadmap',
  managerTarget: 'all',

  resetRun: (run, states) =>
    set({
      ...initRunState(run, states),
      filterAgentId: null,
      selectedAgentId: null,
      roadmap: [],
      instructions: [],
      managerTarget: 'all',
    }),
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
  selectAgent: (selectedAgentId) =>
    set((s) => ({
      selectedAgentId,
      rightTab: selectedAgentId ? 'detail' : s.rightTab === 'detail' ? 'roadmap' : s.rightTab,
    })),
  setNewRunOpen: (newRunOpen) => set({ newRunOpen }),
  setRoadmap: (runId, roadmap) => set((s) => (s.run?.runId === runId ? { roadmap } : s)),
  setInstructions: (instructions) => set({ instructions }),
  instructionUpdated: (item) =>
    set((s) =>
      s.run?.runId === item.runId ? { instructions: upsertInstruction(s.instructions, item) } : s,
    ),
  setRightTab: (rightTab) => set({ rightTab }),
  setManagerTarget: (managerTarget) => set({ managerTarget }),
}));
