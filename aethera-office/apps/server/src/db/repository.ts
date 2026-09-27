import {
  addUsage,
  agentEventSchema,
  describeEvent,
  isActivityEvent,
  truncate,
  type AgentDefinition,
  type AgentEvent,
  type AgentState,
  type AgentStatus,
  type RunStatus,
  type RunSummary,
} from '@aethera/shared';
import type { Db } from './database';

interface RunRow {
  run_id: string;
  started_at: string;
  ended_at: string | null;
  status: RunStatus;
  agents_json: string;
}

interface StateRow {
  run_id: string;
  agent_id: string;
  status: AgentStatus;
  task: string;
  session_id: string | null;
  last_activity: string;
  last_event_at: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

interface EventRow {
  seq: number;
  id: string;
  run_id: string;
  agent_id: string;
  type: string;
  timestamp: string;
  payload_json: string;
}

const ACTIVITY_MAX = 200;

function toRun(row: RunRow): RunSummary {
  return {
    runId: row.run_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    agents: JSON.parse(row.agents_json) as AgentDefinition[],
  };
}

function toState(row: StateRow): AgentState {
  return {
    runId: row.run_id,
    agentId: row.agent_id,
    status: row.status,
    task: row.task,
    sessionId: row.session_id,
    lastActivity: row.last_activity,
    lastEventAt: row.last_event_at,
    usage: {
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheCreationTokens: row.cache_creation_tokens,
    },
  };
}

function toEvent(row: EventRow): AgentEvent | null {
  // Data lama yang tidak lolos skema terbaru dilewati, bukan membuat endpoint gagal.
  const parsed = agentEventSchema.safeParse({
    id: row.id,
    runId: row.run_id,
    agentId: row.agent_id,
    type: row.type,
    timestamp: row.timestamp,
    payload: JSON.parse(row.payload_json) as unknown,
  });
  return parsed.success ? parsed.data : null;
}

/** Status run dari status semua agent-nya. */
export function computeRunStatus(statuses: AgentStatus[]): RunStatus {
  if (statuses.some((s) => s === 'working' || s === 'blocked' || s === 'idle')) return 'running';
  return statuses.some((s) => s === 'error') ? 'failed' : 'completed';
}

export type AppendResult = 'stored' | 'duplicate' | 'unknown_run' | 'unknown_agent';

export class Repository {
  constructor(private readonly db: Db) {}

  createRun(run: RunSummary, tasks: Record<string, string>): void {
    this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO runs (run_id, started_at, ended_at, status, agents_json) VALUES (?, ?, ?, ?, ?)',
        )
        .run(run.runId, run.startedAt, run.endedAt, run.status, JSON.stringify(run.agents));
      const insert = this.db.prepare(
        `INSERT INTO agent_current_state (run_id, agent_id, status, task) VALUES (?, ?, 'idle', ?)`,
      );
      for (const a of run.agents) insert.run(run.runId, a.id, tasks[a.id] ?? '');
    })();
  }

  getRun(runId: string): RunSummary | null {
    const row = this.db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId) as
      RunRow | undefined;
    return row ? toRun(row) : null;
  }

  listRuns(limit = 20): RunSummary[] {
    const rows = this.db
      .prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?')
      .all(limit) as RunRow[];
    return rows.map(toRun);
  }

  listRunningRunIds(): string[] {
    return (
      this.db.prepare(`SELECT run_id FROM runs WHERE status = 'running'`).all() as {
        run_id: string;
      }[]
    ).map((r) => r.run_id);
  }

  setRunStatus(runId: string, status: RunStatus, endedAt: string | null): void {
    this.db
      .prepare('UPDATE runs SET status = ?, ended_at = ? WHERE run_id = ?')
      .run(status, endedAt, runId);
  }

  setAgentTask(runId: string, agentId: string, task: string): void {
    this.db
      .prepare('UPDATE agent_current_state SET task = ? WHERE run_id = ? AND agent_id = ?')
      .run(task, runId, agentId);
  }

  /**
   * Simpan event dan perbarui agent_current_state dalam satu transaksi. Event dengan id yang
   * sudah ada diabaikan (idempoten).
   */
  appendEvent(e: AgentEvent): AppendResult {
    return this.db.transaction((): AppendResult => {
      const state = this.db
        .prepare('SELECT * FROM agent_current_state WHERE run_id = ? AND agent_id = ?')
        .get(e.runId, e.agentId) as StateRow | undefined;
      if (!state) {
        return this.getRun(e.runId) ? 'unknown_agent' : 'unknown_run';
      }
      const inserted = this.db
        .prepare(
          `INSERT OR IGNORE INTO agent_events (id, run_id, agent_id, type, timestamp, payload_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(e.id, e.runId, e.agentId, e.type, e.timestamp, JSON.stringify(e.payload));
      if (inserted.changes === 0) return 'duplicate';

      const next = toState(state);
      next.lastEventAt = e.timestamp;
      if (isActivityEvent(e)) next.lastActivity = truncate(describeEvent(e), ACTIVITY_MAX);
      if (e.type === 'agent.status_change') next.status = e.payload.to;
      if (e.type === 'agent.session_start') next.sessionId = e.payload.sessionId;
      if (e.type === 'agent.session_end') next.usage = addUsage(next.usage, e.payload.usage);

      this.db
        .prepare(
          `UPDATE agent_current_state SET status = ?, session_id = ?, last_activity = ?,
             last_event_at = ?, input_tokens = ?, output_tokens = ?, cache_read_tokens = ?,
             cache_creation_tokens = ?
           WHERE run_id = ? AND agent_id = ?`,
        )
        .run(
          next.status,
          next.sessionId,
          next.lastActivity,
          next.lastEventAt,
          next.usage.inputTokens,
          next.usage.outputTokens,
          next.usage.cacheReadTokens,
          next.usage.cacheCreationTokens,
          e.runId,
          e.agentId,
        );
      return 'stored';
    })();
  }

  /** Event run berurutan kedatangan; kursor = seq terakhir yang sudah diterima. */
  listEvents(
    runId: string,
    afterSeq: number,
    limit: number,
  ): { events: AgentEvent[]; nextCursor: number; hasMore: boolean } {
    const rows = this.db
      .prepare('SELECT * FROM agent_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC LIMIT ?')
      .all(runId, afterSeq, limit + 1) as EventRow[];
    const page = rows.slice(0, limit);
    const events = page.map(toEvent).filter((e): e is AgentEvent => e !== null);
    const last = page.at(-1);
    return { events, nextCursor: last ? last.seq : afterSeq, hasMore: rows.length > limit };
  }

  listAgentStates(runId: string): AgentState[] {
    const rows = this.db
      .prepare('SELECT * FROM agent_current_state WHERE run_id = ? ORDER BY rowid')
      .all(runId) as StateRow[];
    return rows.map(toState);
  }

  getAgentState(runId: string, agentId: string): AgentState | null {
    const row = this.db
      .prepare('SELECT * FROM agent_current_state WHERE run_id = ? AND agent_id = ?')
      .get(runId, agentId) as StateRow | undefined;
    return row ? toState(row) : null;
  }
}
