/**
 * Reducer murni untuk state satu run di dashboard. Status agent diturunkan dari event
 * (bukan dari snapshot) supaya hydrate REST + event socket yang tumpang tindih tetap benar:
 * event dengan id yang sama hanya diterapkan sekali.
 */
import {
  ZERO_USAGE,
  addUsage,
  describeEvent,
  isActivityEvent,
  type AgentDefinition,
  type AgentEvent,
  type AgentState,
  type AgentStatus,
  type RunSummary,
  type TokenUsage,
} from '@aethera/shared';

/** Batas event yang disimpan di memori untuk event stream. */
export const MAX_EVENTS = 2000;
/** Event terakhir per agent untuk panel detail. */
export const RECENT_PER_AGENT = 10;

export interface AgentView {
  def: AgentDefinition;
  status: AgentStatus;
  statusReason: string;
  task: string;
  sessionId: string | null;
  lastActivity: string;
  /** Teks yang sedang diketik agent (pesan parsial), dikosongkan saat pesan utuh datang. */
  typing: string;
  lastEventAt: string | null;
  usage: TokenUsage;
  /** Tool yang sedang berjalan (tool_pre tanpa tool_post). */
  activeTool: string | null;
  recent: AgentEvent[];
}

export interface RunState {
  run: RunSummary | null;
  agents: Record<string, AgentView>;
  agentOrder: string[];
  /** Event untuk stream (tanpa pesan parsial), terbaru di akhir. */
  events: AgentEvent[];
  seen: ReadonlySet<string>;
}

export const EMPTY_RUN_STATE: RunState = {
  run: null,
  agents: {},
  agentOrder: [],
  events: [],
  seen: new Set(),
};

function newAgentView(def: AgentDefinition, task = ''): AgentView {
  return {
    def,
    status: 'idle',
    statusReason: '',
    task,
    sessionId: null,
    lastActivity: '',
    typing: '',
    lastEventAt: null,
    usage: ZERO_USAGE,
    activeTool: null,
    recent: [],
  };
}

/** State awal dari ringkasan run (+ tugas dari snapshot /agents bila ada). */
export function initRunState(run: RunSummary, states: AgentState[] = []): RunState {
  const tasks = new Map(states.map((s) => [s.agentId, s.task]));
  const agents: Record<string, AgentView> = {};
  for (const def of run.agents) agents[def.id] = newAgentView(def, tasks.get(def.id) ?? '');
  return { run, agents, agentOrder: run.agents.map((a) => a.id), events: [], seen: new Set() };
}

function reduceAgent(a: AgentView, e: AgentEvent): AgentView {
  const next: AgentView = { ...a, lastEventAt: e.timestamp };
  switch (e.type) {
    case 'agent.status_change':
      next.status = e.payload.to;
      next.statusReason = e.payload.reason;
      if (e.payload.to === 'done' || e.payload.to === 'error') {
        next.activeTool = null;
        next.typing = '';
      }
      break;
    case 'agent.session_start':
      next.sessionId = e.payload.sessionId;
      break;
    case 'agent.session_end':
      next.usage = addUsage(a.usage, e.payload.usage);
      break;
    case 'agent.tool_pre':
      next.activeTool = e.payload.toolName;
      break;
    case 'agent.tool_post':
      next.activeTool = null;
      break;
    case 'agent.message':
      next.typing = e.payload.partial ? e.payload.text : '';
      break;
    default:
      break;
  }
  if (isActivityEvent(e) && !(e.type === 'agent.message' && e.payload.partial)) {
    next.lastActivity = describeEvent(e);
  }
  if (!(e.type === 'agent.message' && e.payload.partial)) {
    next.recent = [...a.recent, e].slice(-RECENT_PER_AGENT);
  }
  return next;
}

export function applyEvent(state: RunState, e: AgentEvent): RunState {
  if (!state.run || e.runId !== state.run.runId || state.seen.has(e.id)) return state;
  const seen = new Set(state.seen);
  seen.add(e.id);
  const agent = state.agents[e.agentId];
  const agents = agent ? { ...state.agents, [e.agentId]: reduceAgent(agent, e) } : state.agents;
  const partial = e.type === 'agent.message' && e.payload.partial;
  const events = partial ? state.events : [...state.events, e].slice(-MAX_EVENTS);
  return { ...state, agents, events, seen };
}

export function applyEvents(state: RunState, events: AgentEvent[]): RunState {
  return events.reduce(applyEvent, state);
}

export function applyRunUpdate(state: RunState, run: RunSummary): RunState {
  if (!state.run || state.run.runId !== run.runId) return state;
  return { ...state, run: { ...state.run, status: run.status, endedAt: run.endedAt } };
}

/** Urutan tampil roster: error & blocked paling atas, lalu working, idle, done. */
const STATUS_RANK: Record<AgentStatus, number> = {
  error: 0,
  blocked: 1,
  working: 2,
  idle: 3,
  done: 4,
};

export function sortAgentsForRoster(agents: AgentView[]): AgentView[] {
  return [...agents].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
}

export function totalUsage(agents: Record<string, AgentView>): TokenUsage {
  return Object.values(agents).reduce((sum, a) => addUsage(sum, a.usage), ZERO_USAGE);
}
