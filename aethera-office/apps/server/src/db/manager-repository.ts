import type {
  InstructionStatus,
  ManagerInstruction,
  RoadmapItem,
  RoadmapStatus,
  UpdateRoadmapItem,
} from '@aethera/shared';
import type { Db } from './database';

interface RoadmapRow {
  id: string;
  run_id: string;
  title: string;
  assigned_agent_id: string | null;
  status: RoadmapStatus;
  progress_pct: number;
  sort_order: number;
}

interface InstructionRow {
  id: string;
  run_id: string;
  agent_id: string;
  text: string;
  status: InstructionStatus;
  mode: 'resume' | 'new' | null;
  created_at: string;
  sent_at: string | null;
  error: string | null;
}

const toItem = (r: RoadmapRow): RoadmapItem => ({
  id: r.id,
  runId: r.run_id,
  title: r.title,
  assignedAgentId: r.assigned_agent_id,
  status: r.status,
  progressPct: r.progress_pct,
  sortOrder: r.sort_order,
});

const toInstruction = (r: InstructionRow): ManagerInstruction => ({
  id: r.id,
  runId: r.run_id,
  agentId: r.agent_id,
  text: r.text,
  status: r.status,
  mode: r.mode,
  createdAt: r.created_at,
  sentAt: r.sent_at,
  error: r.error,
});

export class ManagerRepository {
  constructor(private readonly db: Db) {}

  // ---- roadmap ----

  listRoadmap(runId: string): RoadmapItem[] {
    return (
      this.db
        .prepare('SELECT * FROM roadmap_items WHERE run_id = ? ORDER BY sort_order, created_at')
        .all(runId) as RoadmapRow[]
    ).map(toItem);
  }

  getRoadmapItem(id: string): RoadmapItem | null {
    const r = this.db.prepare('SELECT * FROM roadmap_items WHERE id = ?').get(id) as
      RoadmapRow | undefined;
    return r ? toItem(r) : null;
  }

  insertRoadmapItem(item: RoadmapItem, now: string): void {
    this.db
      .prepare(
        `INSERT INTO roadmap_items
           (id, run_id, title, assigned_agent_id, status, progress_pct, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        item.id,
        item.runId,
        item.title,
        item.assignedAgentId,
        item.status,
        item.progressPct,
        item.sortOrder,
        now,
        now,
      );
  }

  nextSortOrder(runId: string): number {
    const r = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM roadmap_items WHERE run_id = ?')
      .get(runId) as { n: number };
    return r.n;
  }

  updateRoadmapItem(id: string, patch: UpdateRoadmapItem, now: string): RoadmapItem | null {
    const current = this.getRoadmapItem(id);
    if (!current) return null;
    const next: RoadmapItem = { ...current, ...patch };
    this.db
      .prepare(
        `UPDATE roadmap_items SET title = ?, assigned_agent_id = ?, status = ?, progress_pct = ?,
           sort_order = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        next.title,
        next.assignedAgentId,
        next.status,
        next.progressPct,
        next.sortOrder,
        now,
        id,
      );
    return next;
  }

  deleteRoadmapItem(id: string): boolean {
    return this.db.prepare('DELETE FROM roadmap_items WHERE id = ?').run(id).changes > 0;
  }

  // ---- instruksi manager ----

  insertInstruction(i: ManagerInstruction): void {
    this.db
      .prepare(
        `INSERT INTO manager_instructions (id, run_id, agent_id, text, status, mode, created_at, sent_at, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(i.id, i.runId, i.agentId, i.text, i.status, i.mode, i.createdAt, i.sentAt, i.error);
  }

  updateInstruction(
    id: string,
    patch: Pick<ManagerInstruction, 'status' | 'mode' | 'sentAt' | 'error'>,
  ): ManagerInstruction | null {
    this.db
      .prepare(
        'UPDATE manager_instructions SET status = ?, mode = ?, sent_at = ?, error = ? WHERE id = ?',
      )
      .run(patch.status, patch.mode, patch.sentAt, patch.error, id);
    const r = this.db.prepare('SELECT * FROM manager_instructions WHERE id = ?').get(id) as
      InstructionRow | undefined;
    return r ? toInstruction(r) : null;
  }

  listInstructions(runId: string): ManagerInstruction[] {
    return (
      this.db
        .prepare('SELECT * FROM manager_instructions WHERE run_id = ? ORDER BY created_at, rowid')
        .all(runId) as InstructionRow[]
    ).map(toInstruction);
  }

  /** Instruksi antre tertua untuk satu agent. */
  nextQueued(runId: string, agentId: string): ManagerInstruction | null {
    const r = this.db
      .prepare(
        `SELECT * FROM manager_instructions WHERE run_id = ? AND agent_id = ? AND status = 'queued'
         ORDER BY created_at, rowid LIMIT 1`,
      )
      .get(runId, agentId) as InstructionRow | undefined;
    return r ? toInstruction(r) : null;
  }

  /** Saat server start: instruksi antre dari proses lama tidak akan pernah terkirim. */
  failStaleQueued(message: string): number {
    return this.db
      .prepare(
        `UPDATE manager_instructions SET status = 'failed', error = ? WHERE status = 'queued'`,
      )
      .run(message).changes;
  }
}
