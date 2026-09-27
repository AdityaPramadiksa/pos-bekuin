import { randomUUID } from 'node:crypto';
import {
  truncate,
  type AgentEvent,
  type CreateRoadmapItem,
  type RoadmapItem,
  type RunSummary,
  type UpdateRoadmapItem,
} from '@aethera/shared';
import type { ManagerRepository } from './db/manager-repository';
import type { Repository } from './db/repository';
import type { EventBus } from './event-bus';

/** Kenaikan progres perkiraan per tool selesai untuk item yang sedang dikerjakan. */
const PROGRESS_PER_TOOL = 5;
const PROGRESS_CAP_WHILE_WORKING = 90;
const PROGRESS_ON_START = 10;

export type RoadmapError = 'run_not_found' | 'item_not_found' | 'agent_not_in_run';

/**
 * Roadmap per run. Status item mengikuti agent yang ditugaskan: working → in_progress,
 * done → done (100%). Progres saat in_progress adalah PERKIRAAN (naik tiap tool selesai,
 * maksimal 90%) karena Claude Code tidak melaporkan persentase tugas.
 */
export class RoadmapService {
  private readonly now: () => Date;

  constructor(
    private readonly repo: Repository,
    private readonly managerRepo: ManagerRepository,
    private readonly bus: EventBus,
    now?: () => Date,
  ) {
    this.now = now ?? (() => new Date());
    bus.subscribe((msg) => {
      if (msg.kind === 'event') this.onEvent(msg.event);
    });
  }

  list(runId: string): RoadmapItem[] {
    return this.managerRepo.listRoadmap(runId);
  }

  /** Satu item per agent saat run dibuat, judul dari tugasnya. */
  seedForRun(run: RunSummary, tasks: Record<string, string>): void {
    const now = this.now().toISOString();
    run.agents.forEach((a, i) => {
      this.managerRepo.insertRoadmapItem(
        {
          id: randomUUID(),
          runId: run.runId,
          title: truncate(tasks[a.id] ?? a.role, 120),
          assignedAgentId: a.id,
          status: 'pending',
          progressPct: 0,
          sortOrder: i,
        },
        now,
      );
    });
    this.publish(run.runId);
  }

  create(runId: string, input: CreateRoadmapItem): RoadmapItem | RoadmapError {
    const run = this.repo.getRun(runId);
    if (!run) return 'run_not_found';
    const assigned = input.assignedAgentId ?? null;
    if (assigned && !run.agents.some((a) => a.id === assigned)) return 'agent_not_in_run';
    const item: RoadmapItem = {
      id: randomUUID(),
      runId,
      title: input.title.trim(),
      assignedAgentId: assigned,
      status: 'pending',
      progressPct: 0,
      sortOrder: this.managerRepo.nextSortOrder(runId),
    };
    this.managerRepo.insertRoadmapItem(item, this.now().toISOString());
    this.publish(runId);
    return item;
  }

  update(id: string, patch: UpdateRoadmapItem): RoadmapItem | RoadmapError {
    const current = this.managerRepo.getRoadmapItem(id);
    if (!current) return 'item_not_found';
    if (patch.assignedAgentId) {
      const run = this.repo.getRun(current.runId);
      if (!run?.agents.some((a) => a.id === patch.assignedAgentId)) return 'agent_not_in_run';
    }
    const normalized = { ...patch };
    // Konsistensi status ↔ progres bila hanya salah satu yang diubah manual.
    if (patch.status === 'done' && patch.progressPct === undefined) normalized.progressPct = 100;
    if (patch.status === 'pending' && patch.progressPct === undefined) normalized.progressPct = 0;
    if (patch.progressPct === 100 && patch.status === undefined) normalized.status = 'done';
    const next = this.managerRepo.updateRoadmapItem(id, normalized, this.now().toISOString());
    this.publish(current.runId);
    return next ?? 'item_not_found';
  }

  remove(id: string): boolean {
    const current = this.managerRepo.getRoadmapItem(id);
    if (!current) return false;
    this.managerRepo.deleteRoadmapItem(id);
    this.publish(current.runId);
    return true;
  }

  private onEvent(e: AgentEvent): void {
    const items = this.managerRepo
      .listRoadmap(e.runId)
      .filter((i) => i.assignedAgentId === e.agentId);
    if (items.length === 0) return;
    const now = this.now().toISOString();
    let changed = false;

    for (const item of items) {
      let patch: UpdateRoadmapItem | null = null;
      if (
        e.type === 'agent.status_change' &&
        e.payload.to === 'working' &&
        item.status === 'pending'
      ) {
        patch = {
          status: 'in_progress',
          progressPct: Math.max(item.progressPct, PROGRESS_ON_START),
        };
      } else if (
        e.type === 'agent.status_change' &&
        e.payload.to === 'done' &&
        item.status === 'in_progress'
      ) {
        patch = { status: 'done', progressPct: 100 };
      } else if (
        e.type === 'agent.tool_post' &&
        item.status === 'in_progress' &&
        item.progressPct < PROGRESS_CAP_WHILE_WORKING
      ) {
        patch = {
          progressPct: Math.min(PROGRESS_CAP_WHILE_WORKING, item.progressPct + PROGRESS_PER_TOOL),
        };
      }
      if (patch) {
        this.managerRepo.updateRoadmapItem(item.id, patch, now);
        changed = true;
      }
    }
    if (changed) this.publish(e.runId);
  }

  private publish(runId: string): void {
    this.bus.publish({ kind: 'roadmap', runId, items: this.managerRepo.listRoadmap(runId) });
  }
}
