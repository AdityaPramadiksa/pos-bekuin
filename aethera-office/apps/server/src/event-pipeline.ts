import { agentEventSchema, type AgentEvent } from '@aethera/shared';
import type { z } from 'zod';
import { computeRunStatus, type Repository } from './db/repository';
import type { EventBus } from './event-bus';

export type IngestResult =
  | { ok: true; event: AgentEvent; duplicate: boolean }
  | { ok: false; reason: 'invalid'; issues: z.core.$ZodIssue[] }
  | { ok: false; reason: 'unknown_run' | 'unknown_agent' };

/**
 * Satu-satunya jalur masuk AgentEvent: validasi Zod → simpan (transaksi) → broadcast →
 * perbarui status run. Dipakai orchestrator maupun POST /events.
 */
export class EventPipeline {
  constructor(
    private readonly repo: Repository,
    private readonly bus: EventBus,
    private readonly now: () => Date = () => new Date(),
  ) {}

  ingest(raw: unknown): IngestResult {
    const parsed = agentEventSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, reason: 'invalid', issues: parsed.error.issues };
    const event = parsed.data;

    const result = this.repo.appendEvent(event);
    if (result === 'unknown_run' || result === 'unknown_agent')
      return { ok: false, reason: result };
    if (result === 'duplicate') return { ok: true, event, duplicate: true };

    this.bus.publish({ kind: 'event', event });
    if (event.type === 'agent.status_change') this.refreshRunStatus(event.runId);
    return { ok: true, event, duplicate: false };
  }

  /** Hitung ulang status run dari status agent; broadcast bila berubah. */
  refreshRunStatus(runId: string): void {
    const run = this.repo.getRun(runId);
    if (!run) return;
    const status = computeRunStatus(this.repo.listAgentStates(runId).map((s) => s.status));
    if (status === run.status) return;
    const endedAt = status === 'running' ? null : this.now().toISOString();
    this.repo.setRunStatus(runId, status, endedAt);
    this.bus.publish({ kind: 'run', run: { ...run, status, endedAt } });
  }
}
