import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  AgentDefinition,
  AgentEvent,
  ManagerInstruction,
  RoadmapItem,
  RunSummary,
} from '@aethera/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../src/app';
import { openDatabase, type Db } from '../../src/db/database';
import { ManagerRepository } from '../../src/db/manager-repository';
import { Repository } from '../../src/db/repository';
import { InProcessEventBus } from '../../src/event-bus';
import { EventPipeline } from '../../src/event-pipeline';
import { InstructionService } from '../../src/instruction-service';
import { RoadmapService } from '../../src/roadmap-service';
import { RunService, type AgentRunner } from '../../src/run-service';
import type { SpawnAgentInput } from '../../src/orchestrator/process-manager';

const agents: AgentDefinition[] = [
  { id: 'lulu', name: 'Lulu', role: 'QA', deskPosition: { x: 0, z: 0 }, color: '#ec4899' },
  { id: 'zaki', name: 'Zaki', role: 'Developer', deskPosition: { x: 2, z: 0 }, color: '#22c55e' },
];

/** Runner palsu yang memancarkan status_change seperti AgentProcessManager sungguhan. */
class FakeRunner implements AgentRunner {
  spawned: SpawnAgentInput[] = [];
  running = new Set<string>();
  failNext = false;
  constructor(private readonly ingest: (e: AgentEvent) => void) {}
  spawnAgent(input: SpawnAgentInput) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('claude tidak ditemukan');
    }
    this.spawned.push(input);
    this.running.add(`${input.runId}/${input.agent.id}`);
    this.status(input.runId, input.agent.id, 'idle', 'working');
    return { sessionId: input.resumeSessionId ?? 'baru' };
  }
  stopAgent() {
    return true;
  }
  isRunning(runId: string, agentId: string) {
    return this.running.has(`${runId}/${agentId}`);
  }
  /** Simulasikan proses agent selesai. */
  finish(runId: string, agentId: string, to: 'done' | 'error' = 'done') {
    this.running.delete(`${runId}/${agentId}`);
    this.status(runId, agentId, 'working', to);
  }
  emit(e: Omit<AgentEvent, 'id' | 'timestamp'>) {
    this.ingest({ ...e, id: randomUUID(), timestamp: new Date().toISOString() } as AgentEvent);
  }
  private status(runId: string, agentId: string, from: string, to: string) {
    this.emit({
      runId,
      agentId,
      type: 'agent.status_change',
      payload: { from, to, reason: '' },
    } as never);
  }
}

let db: Db;
let app: App;
let repo: Repository;
let runner: FakeRunner;

beforeEach(() => {
  db = openDatabase(':memory:');
  repo = new Repository(db);
  const bus = new InProcessEventBus();
  const pipeline = new EventPipeline(repo, bus);
  runner = new FakeRunner((e) => {
    pipeline.ingest(e);
  });
  const managerRepo = new ManagerRepository(db);
  const roadmap = new RoadmapService(repo, managerRepo, bus);
  const runs = new RunService(repo, pipeline, bus, runner, {
    workspacesDir: mkdtempSync(join(tmpdir(), 'aethera-test-')),
    onRunCreated: (run, tasks) => roadmap.seedForRun(run, tasks),
  });
  const instructions = new InstructionService(repo, managerRepo, bus, runner, (r, a) =>
    runs.workingDirFor(r, a),
  );
  app = buildApp({ repo, bus, pipeline, runs, roadmap, instructions, handleHook: () => true });
});

afterEach(async () => {
  await app.fastify.close();
  db.close();
});

async function startRun(): Promise<RunSummary> {
  const res = await app.fastify.inject({
    method: 'POST',
    url: '/runs',
    payload: { agents, tasks: { lulu: 'Tulis rencana uji', zaki: 'Bangun CLI todo' } },
  });
  return res.json<RunSummary>();
}

const roadmapOf = async (runId: string) =>
  (await app.fastify.inject(`/runs/${runId}/roadmap`)).json<RoadmapItem[]>();
const instructionsOf = async (runId: string) =>
  (await app.fastify.inject(`/runs/${runId}/instructions`)).json<ManagerInstruction[]>();

describe('Roadmap', () => {
  it('dibuat otomatis satu item per agent dan mengikuti status agent', async () => {
    const run = await startRun();
    let items = await roadmapOf(run.runId);
    expect(items.map((i) => [i.title, i.assignedAgentId, i.status, i.progressPct])).toEqual([
      ['Tulis rencana uji', 'lulu', 'in_progress', 10],
      ['Bangun CLI todo', 'zaki', 'in_progress', 10],
    ]);

    // Tool selesai menaikkan progres perkiraan, maksimal 90%.
    for (let i = 0; i < 30; i++) {
      runner.emit({
        runId: run.runId,
        agentId: 'zaki',
        type: 'agent.tool_post',
        payload: {
          toolUseId: `t${i}`,
          toolName: 'Edit',
          success: true,
          durationMs: 1,
          resultSummary: '',
        },
      } as never);
    }
    runner.finish(run.runId, 'lulu');
    items = await roadmapOf(run.runId);
    expect(items.map((i) => [i.status, i.progressPct])).toEqual([
      ['done', 100],
      ['in_progress', 90],
    ]);
  });

  it('CRUD: tambah, ubah status/progres, hapus, validasi', async () => {
    const run = await startRun();
    const created = await app.fastify.inject({
      method: 'POST',
      url: `/runs/${run.runId}/roadmap`,
      payload: { title: 'Rilis', assignedAgentId: null },
    });
    expect(created.statusCode).toBe(201);
    const item = created.json<RoadmapItem>();
    expect(item).toMatchObject({ title: 'Rilis', status: 'pending', progressPct: 0, sortOrder: 2 });

    const patched = await app.fastify.inject({
      method: 'PATCH',
      url: `/roadmap/${item.id}`,
      payload: { status: 'done' },
    });
    expect(patched.json<RoadmapItem>()).toMatchObject({ status: 'done', progressPct: 100 });

    expect(
      (await app.fastify.inject({ method: 'PATCH', url: `/roadmap/${item.id}`, payload: {} }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.fastify.inject({
          method: 'PATCH',
          url: `/roadmap/${item.id}`,
          payload: { progressPct: 101 },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.fastify.inject({
          method: 'PATCH',
          url: `/roadmap/${item.id}`,
          payload: { assignedAgentId: 'hantu' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.fastify.inject({
          method: 'POST',
          url: `/runs/${run.runId}/roadmap`,
          payload: { title: ' ' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.fastify.inject({
          method: 'POST',
          url: '/runs/tidak-ada/roadmap',
          payload: { title: 'x' },
        })
      ).statusCode,
    ).toBe(404);

    expect(
      (await app.fastify.inject({ method: 'DELETE', url: `/roadmap/${item.id}` })).statusCode,
    ).toBe(204);
    expect(
      (await app.fastify.inject({ method: 'DELETE', url: `/roadmap/${item.id}` })).statusCode,
    ).toBe(404);
    expect(await roadmapOf(run.runId)).toHaveLength(2);
  });
});

describe('Manager Command Layer', () => {
  it('agent yang sedang berjalan → instruksi antre, dikirim via --resume saat proses selesai', async () => {
    const run = await startRun();
    runner.emit({
      runId: run.runId,
      agentId: 'zaki',
      type: 'agent.session_start',
      payload: { sessionId: 'sess-zaki', model: 'm', cwd: '/w' },
    } as never);

    const res = await app.fastify.inject({
      method: 'POST',
      url: `/runs/${run.runId}/instructions`,
      payload: { target: 'zaki', text: 'Tambahkan perintah clear' },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json<ManagerInstruction[]>()).toMatchObject([{ status: 'queued', agentId: 'zaki' }]);
    expect(runner.spawned).toHaveLength(2); // hanya spawn awal

    runner.finish(run.runId, 'zaki');
    const [instr] = await instructionsOf(run.runId);
    expect(instr).toMatchObject({ status: 'sent', mode: 'resume', sentAt: expect.any(String) });
    expect(runner.spawned.at(-1)).toMatchObject({
      task: 'Tambahkan perintah clear',
      resumeSessionId: 'sess-zaki',
      agent: { id: 'zaki' },
    });
    expect(repo.getAgentState(run.runId, 'zaki')).toMatchObject({
      status: 'working',
      task: 'Tambahkan perintah clear',
    });
  });

  it('agent yang sudah selesai → langsung dikirim; run kembali running', async () => {
    const run = await startRun();
    runner.finish(run.runId, 'lulu');
    runner.finish(run.runId, 'zaki');
    expect(repo.getRun(run.runId)!.status).toBe('completed');

    await app.fastify.inject({
      method: 'POST',
      url: `/runs/${run.runId}/instructions`,
      payload: { target: 'all', text: 'Ringkas hasil kerjamu' },
    });
    const list = await instructionsOf(run.runId);
    // Belum ada session_start → sesi baru.
    expect(list.map((i) => [i.agentId, i.status, i.mode])).toEqual([
      ['lulu', 'sent', 'new'],
      ['zaki', 'sent', 'new'],
    ]);
    expect(repo.getRun(run.runId)).toMatchObject({ status: 'running', endedAt: null });
  });

  it('beberapa instruksi antre dikirim berurutan satu per satu', async () => {
    const run = await startRun();
    for (const text of ['satu', 'dua']) {
      await app.fastify.inject({
        method: 'POST',
        url: `/runs/${run.runId}/instructions`,
        payload: { target: 'lulu', text },
      });
    }
    runner.finish(run.runId, 'lulu');
    expect((await instructionsOf(run.runId)).map((i) => i.status)).toEqual(['sent', 'queued']);
    runner.finish(run.runId, 'lulu');
    expect((await instructionsOf(run.runId)).map((i) => i.status)).toEqual(['sent', 'sent']);
    expect(runner.spawned.map((s) => s.task).slice(-2)).toEqual(['satu', 'dua']);
  });

  it('spawn gagal → instruksi failed dengan pesan; stop membatalkan antrean', async () => {
    const run = await startRun();
    runner.finish(run.runId, 'lulu');
    runner.failNext = true;
    await app.fastify.inject({
      method: 'POST',
      url: `/runs/${run.runId}/instructions`,
      payload: { target: 'lulu', text: 'x' },
    });
    expect(await instructionsOf(run.runId)).toMatchObject([
      { status: 'failed', error: 'claude tidak ditemukan' },
    ]);

    await app.fastify.inject({
      method: 'POST',
      url: `/runs/${run.runId}/instructions`,
      payload: { target: 'zaki', text: 'y' },
    });
    await app.fastify.inject({ method: 'POST', url: `/runs/${run.runId}/agents/zaki/stop` });
    runner.finish(run.runId, 'zaki');
    expect((await instructionsOf(run.runId)).at(-1)).toMatchObject({
      status: 'failed',
      error: 'dibatalkan karena agent dihentikan',
    });
  });

  it('validasi: target tak dikenal 400, teks kosong 400, run tak ada 404', async () => {
    const run = await startRun();
    const post = (url: string, payload: object) =>
      app.fastify.inject({ method: 'POST', url, payload });
    expect(
      (await post(`/runs/${run.runId}/instructions`, { target: 'hantu', text: 'x' })).statusCode,
    ).toBe(400);
    expect(
      (await post(`/runs/${run.runId}/instructions`, { target: 'all', text: '   ' })).statusCode,
    ).toBe(400);
    expect(
      (await post('/runs/tidak-ada/instructions', { target: 'all', text: 'x' })).statusCode,
    ).toBe(404);
  });
});
