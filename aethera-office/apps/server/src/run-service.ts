import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AgentStatus, RunSummary, StartRunRequest } from '@aethera/shared';
import { makeEvent, type EventContext } from './orchestrator/context';
import type { Repository } from './db/repository';
import type { EventBus } from './event-bus';
import type { EventPipeline } from './event-pipeline';
import type { SpawnAgentInput } from './orchestrator/process-manager';

/** Bagian AgentProcessManager yang dipakai RunService (di-mock di test). */
export interface AgentRunner {
  spawnAgent(input: SpawnAgentInput): { sessionId: string };
  stopAgent(runId: string, agentId: string): boolean;
  isRunning(runId: string, agentId: string): boolean;
}

export interface RunServiceOptions {
  workspacesDir: string;
  /** Dipanggil setelah run tersimpan dan SEBELUM agent di-spawn (mis. membuat roadmap awal). */
  onRunCreated?: (run: RunSummary, tasks: Record<string, string>) => void;
  now?: () => Date;
  newId?: () => string;
}

export class RunService {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(
    private readonly repo: Repository,
    private readonly pipeline: EventPipeline,
    private readonly bus: EventBus,
    private readonly runner: AgentRunner,
    private readonly opts: RunServiceOptions,
  ) {
    this.now = opts.now ?? (() => new Date());
    this.newId = opts.newId ?? randomUUID;
  }

  workingDirFor(runId: string, agentId: string): string {
    return resolve(join(this.opts.workspacesDir, runId, agentId));
  }

  startRun(req: StartRunRequest): RunSummary {
    const startedAt = this.now();
    const runId = `run-${startedAt.toISOString().slice(0, 10).replace(/-/g, '')}-${this.newId().slice(0, 8)}`;
    const run: RunSummary = {
      runId,
      startedAt: startedAt.toISOString(),
      endedAt: null,
      agents: req.agents,
      status: 'running',
    };
    this.repo.createRun(run, req.tasks);
    this.bus.publish({ kind: 'run', run });
    this.opts.onRunCreated?.(run, req.tasks);

    for (const agent of req.agents) {
      const workingDir = this.workingDirFor(runId, agent.id);
      try {
        mkdirSync(workingDir, { recursive: true });
        this.runner.spawnAgent({ runId, agent, task: req.tasks[agent.id]!, workingDir });
      } catch (err) {
        this.failAgent(runId, agent.id, err instanceof Error ? err.message : String(err));
      }
    }
    return this.repo.getRun(runId) ?? run;
  }

  stopAgent(runId: string, agentId: string): boolean {
    return this.runner.stopAgent(runId, agentId);
  }

  /**
   * Saat server start: run yang masih "running" dari proses sebelumnya pasti sudah mati
   * (proses agent ikut berhenti). Tandai agent-nya error "server restart".
   */
  recoverStaleRuns(): string[] {
    const stale = this.repo.listRunningRunIds();
    for (const runId of stale) {
      for (const s of this.repo.listAgentStates(runId)) {
        if (isActive(s.status)) this.failAgent(runId, s.agentId, 'server restart', s.status);
      }
      this.pipeline.refreshRunStatus(runId);
    }
    return stale;
  }

  private failAgent(runId: string, agentId: string, message: string, from?: AgentStatus): void {
    const ctx: EventContext = {
      runId,
      agentId,
      cwd: '',
      now: this.now,
      newId: this.newId,
    };
    const current = from ?? this.repo.getAgentState(runId, agentId)?.status ?? 'idle';
    this.pipeline.ingest(makeEvent(ctx, 'agent.error', { message }));
    if (current !== 'error') {
      this.pipeline.ingest(
        makeEvent(ctx, 'agent.status_change', { from: current, to: 'error', reason: message }),
      );
    }
  }
}

function isActive(s: AgentStatus): boolean {
  return s === 'idle' || s === 'working' || s === 'blocked';
}
