/**
 * Manager Command Layer: instruksi tambahan ke agent.
 *
 * Kapabilitas CLI yang terkonfirmasi (code.claude.com/docs/en/headless + uji langsung
 * `claude -p ... --resume <id>` di mesin ini):
 * - `claude -p "<instruksi>" --resume <session_id>` melanjutkan percakapan agent dengan
 *   konteksnya sendiri dan TETAP memakai session_id yang sama (terlihat di system/init).
 * - `usage` di pesan result hanya menghitung proses itu sendiri (bukan kumulatif), jadi
 *   token per agent tetap dijumlah per session_end. `total_cost_usd` justru kumulatif.
 * - `--input-format stream-json` ada (input realtime), tetapi format pesannya tidak
 *   dijelaskan di dokumentasi headless, jadi tidak dipakai.
 *
 * Desain: agent yang sedang berjalan → instruksi DIANTREKAN dan dikirim otomatis via
 * --resume begitu prosesnya selesai. Agent yang sudah berhenti → langsung --resume. Agent
 * tanpa sesi (belum pernah start / gagal spawn) → sesi baru dengan instruksi sebagai tugas.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import type { AgentDefinition, ManagerInstruction } from '@aethera/shared';
import type { ManagerRepository } from './db/manager-repository';
import type { Repository } from './db/repository';
import type { EventBus } from './event-bus';
import type { AgentRunner } from './run-service';

export type SendError = 'run_not_found' | 'agent_not_in_run';

export class InstructionService {
  private readonly now: () => Date;

  constructor(
    private readonly repo: Repository,
    private readonly managerRepo: ManagerRepository,
    private readonly bus: EventBus,
    private readonly runner: AgentRunner,
    private readonly workingDirFor: (runId: string, agentId: string) => string,
    now?: () => Date,
  ) {
    this.now = now ?? (() => new Date());
    // Proses agent selesai (done/error) → kirim instruksi antre berikutnya.
    bus.subscribe((msg) => {
      if (msg.kind !== 'event' || msg.event.type !== 'agent.status_change') return;
      const to = msg.event.payload.to;
      if (to === 'done' || to === 'error') this.dispatchNext(msg.event.runId, msg.event.agentId);
    });
  }

  list(runId: string): ManagerInstruction[] {
    return this.managerRepo.listInstructions(runId);
  }

  send(runId: string, target: string, text: string): ManagerInstruction[] | SendError {
    const run = this.repo.getRun(runId);
    if (!run) return 'run_not_found';
    const agents = target === 'all' ? run.agents : run.agents.filter((a) => a.id === target);
    if (agents.length === 0) return 'agent_not_in_run';

    const created: ManagerInstruction[] = [];
    for (const agent of agents) {
      const instruction: ManagerInstruction = {
        id: randomUUID(),
        runId,
        agentId: agent.id,
        text,
        status: 'queued',
        mode: null,
        createdAt: this.now().toISOString(),
        sentAt: null,
        error: null,
      };
      this.managerRepo.insertInstruction(instruction);
      this.bus.publish({ kind: 'instruction', instruction });
      created.push(instruction);
      if (!this.runner.isRunning(runId, agent.id)) this.dispatchNext(runId, agent.id);
    }
    const latest = new Map(this.managerRepo.listInstructions(runId).map((i) => [i.id, i]));
    return created.map((c) => latest.get(c.id) ?? c);
  }

  /** Agent dihentikan manager: instruksi yang masih antre dibatalkan, bukan dikirim otomatis. */
  cancelQueued(runId: string, agentId: string): void {
    for (;;) {
      const next = this.managerRepo.nextQueued(runId, agentId);
      if (!next) return;
      const updated = this.managerRepo.updateInstruction(next.id, {
        status: 'failed',
        mode: null,
        sentAt: null,
        error: 'dibatalkan karena agent dihentikan',
      });
      if (updated) this.bus.publish({ kind: 'instruction', instruction: updated });
    }
  }

  /** Kirim instruksi antre tertua untuk agent ini bila agent sedang tidak berjalan. */
  dispatchNext(runId: string, agentId: string): void {
    if (this.runner.isRunning(runId, agentId)) return;
    const next = this.managerRepo.nextQueued(runId, agentId);
    if (!next) return;
    const run = this.repo.getRun(runId);
    const agent: AgentDefinition | undefined = run?.agents.find((a) => a.id === agentId);
    const state = this.repo.getAgentState(runId, agentId);
    if (!agent || !state) return;

    const mode = state.sessionId ? 'resume' : 'new';
    // Tandai terkirim SEBELUM spawn: spawn memancarkan status_change sinkron dan tidak boleh
    // memicu pengiriman ulang instruksi yang sama.
    let updated = this.managerRepo.updateInstruction(next.id, {
      status: 'sent',
      mode,
      sentAt: this.now().toISOString(),
      error: null,
    });
    try {
      const workingDir = this.workingDirFor(runId, agentId);
      mkdirSync(workingDir, { recursive: true });
      this.repo.setAgentTask(runId, agentId, next.text);
      this.runner.spawnAgent({
        runId,
        agent,
        task: next.text,
        workingDir,
        ...(state.sessionId ? { resumeSessionId: state.sessionId } : {}),
      });
    } catch (err) {
      updated = this.managerRepo.updateInstruction(next.id, {
        status: 'failed',
        mode,
        sentAt: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (updated) this.bus.publish({ kind: 'instruction', instruction: updated });
  }
}
