import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  SOCKET_EVENTS,
  type AgentDefinition,
  type AgentEvent,
  type AgentState,
  type RunDetailResponse,
  type RunSummary,
} from '@aethera/shared';
import { io as connect, type Socket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../src/app';
import { openDatabase, type Db } from '../../src/db/database';
import { Repository } from '../../src/db/repository';
import { InProcessEventBus } from '../../src/event-bus';
import { EventPipeline } from '../../src/event-pipeline';
import { ManagerRepository } from '../../src/db/manager-repository';
import { InstructionService } from '../../src/instruction-service';
import { RoadmapService } from '../../src/roadmap-service';
import { RunService, type AgentRunner } from '../../src/run-service';
import type { SpawnAgentInput } from '../../src/orchestrator/process-manager';

const agents: AgentDefinition[] = [
  { id: 'lulu', name: 'Lulu', role: 'QA', deskPosition: { x: 0, z: 0 }, color: '#ec4899' },
  { id: 'zaki', name: 'Zaki', role: 'Developer', deskPosition: { x: 2, z: 0 }, color: '#22c55e' },
];

class FakeRunner implements AgentRunner {
  spawned: SpawnAgentInput[] = [];
  stopped: string[] = [];
  failFor = new Set<string>();
  running = new Set<string>();
  spawnAgent(input: SpawnAgentInput) {
    if (this.failFor.has(input.agent.id)) throw new Error('claude tidak ditemukan');
    this.spawned.push(input);
    this.running.add(`${input.runId}/${input.agent.id}`);
    return { sessionId: input.resumeSessionId ?? 's' };
  }
  stopAgent(runId: string, agentId: string) {
    this.stopped.push(`${runId}/${agentId}`);
    return true;
  }
  isRunning(runId: string, agentId: string) {
    return this.running.has(`${runId}/${agentId}`);
  }
}

let db: Db;
let app: App;
let repo: Repository;
let runner: FakeRunner;
let pipeline: EventPipeline;
let runs: RunService;
const hooks: unknown[] = [];

function setup() {
  db = openDatabase(':memory:');
  repo = new Repository(db);
  const bus = new InProcessEventBus();
  pipeline = new EventPipeline(repo, bus);
  runner = new FakeRunner();
  const managerRepo = new ManagerRepository(db);
  const roadmap = new RoadmapService(repo, managerRepo, bus);
  runs = new RunService(repo, pipeline, bus, runner, {
    workspacesDir: mkdtempSync(join(tmpdir(), 'aethera-test-')),
    onRunCreated: (run, tasks) => roadmap.seedForRun(run, tasks),
  });
  const instructions = new InstructionService(repo, managerRepo, bus, runner, (r, a) =>
    runs.workingDirFor(r, a),
  );
  app = buildApp({
    repo,
    bus,
    pipeline,
    runs,
    roadmap,
    instructions,
    handleHook: (b) => (hooks.push(b), true),
  });
}

function ev(
  runId: string,
  agentId: string,
  rest: Pick<AgentEvent, 'type' | 'payload'>,
  ts = new Date(),
): AgentEvent {
  return { id: randomUUID(), runId, agentId, timestamp: ts.toISOString(), ...rest } as AgentEvent;
}

async function startRun(): Promise<RunSummary> {
  const res = await app.fastify.inject({
    method: 'POST',
    url: '/runs',
    payload: { agents, tasks: { lulu: 'jalankan tes', zaki: 'perbaiki bug' } },
  });
  expect(res.statusCode).toBe(201);
  return res.json<RunSummary>();
}

async function post(e: unknown) {
  return app.fastify.inject({ method: 'POST', url: '/events', payload: e as object });
}

beforeEach(setup);
afterEach(async () => {
  await app.fastify.close();
  db.close();
});

describe('POST /runs', () => {
  it('membuat run & men-spawn tiap agent di folder kerjanya sendiri', async () => {
    const run = await startRun();
    expect(run.status).toBe('running');
    expect(runner.spawned.map((s) => [s.agent.id, s.task])).toEqual([
      ['lulu', 'jalankan tes'],
      ['zaki', 'perbaiki bug'],
    ]);
    expect(runner.spawned[0]!.workingDir).toMatch(new RegExp(`${run.runId}/lulu$`));
    const list = (await app.fastify.inject('/runs')).json<RunSummary[]>();
    expect(list.map((r) => r.runId)).toEqual([run.runId]);
  });

  it('menolak body tidak valid: tugas hilang, id dobel', async () => {
    const res = await app.fastify.inject({
      method: 'POST',
      url: '/runs',
      payload: { agents: [agents[0], agents[0]], tasks: {} },
    });
    expect(res.statusCode).toBe(400);
    const msgs = res.json<{ issues: { message: string }[] }>().issues.map((i) => i.message);
    expect(msgs).toEqual(
      expect.arrayContaining(['id agent harus unik', 'tugas untuk lulu kosong']),
    );
  });

  it('spawn gagal → agent langsung error, run failed setelah agent lain selesai', async () => {
    runner.failFor.add('zaki');
    const run = await startRun();
    const states = (await app.fastify.inject(`/runs/${run.runId}/agents`)).json<AgentState[]>();
    expect(states.find((s) => s.agentId === 'zaki')).toMatchObject({
      status: 'error',
      lastActivity: 'Error: claude tidak ditemukan',
    });
    await post(
      ev(run.runId, 'lulu', {
        type: 'agent.status_change',
        payload: { from: 'idle', to: 'done', reason: '' },
      }),
    );
    expect(repo.getRun(run.runId)!.status).toBe('failed');
  });
});

describe('POST /events → GET /runs/:runId', () => {
  it('menyimpan event berurutan dan memperbarui status terkini', async () => {
    const run = await startRun();
    const t0 = Date.parse('2026-09-27T05:00:00.000Z');
    const events: AgentEvent[] = [
      ev(
        run.runId,
        'zaki',
        { type: 'agent.status_change', payload: { from: 'idle', to: 'working', reason: 'mulai' } },
        new Date(t0),
      ),
      ev(
        run.runId,
        'zaki',
        {
          type: 'agent.session_start',
          payload: { sessionId: 'sess-z', model: 'haiku', cwd: '/w' },
        },
        new Date(t0 + 1),
      ),
      ev(
        run.runId,
        'zaki',
        {
          type: 'agent.tool_pre',
          payload: { toolUseId: 't1', toolName: 'Edit', inputSummary: 'src/main.ts' },
        },
        new Date(t0 + 2),
      ),
      ev(
        run.runId,
        'zaki',
        {
          type: 'agent.tool_post',
          payload: {
            toolUseId: 't1',
            toolName: 'Edit',
            success: true,
            durationMs: 12,
            resultSummary: '',
          },
        },
        new Date(t0 + 3),
      ),
      ev(
        run.runId,
        'zaki',
        {
          type: 'agent.session_end',
          payload: {
            exitCode: 0,
            durationMs: 900,
            numTurns: 2,
            usage: {
              inputTokens: 10,
              outputTokens: 20,
              cacheReadTokens: 300,
              cacheCreationTokens: 40,
            },
          },
        },
        new Date(t0 + 4),
      ),
      ev(
        run.runId,
        'zaki',
        {
          type: 'agent.status_change',
          payload: { from: 'working', to: 'done', reason: 'selesai' },
        },
        new Date(t0 + 5),
      ),
    ];
    for (const e of events) expect((await post(e)).statusCode).toBe(201);
    expect((await post(events[0])).statusCode).toBe(200); // duplikat → idempoten

    const detail = (await app.fastify.inject(`/runs/${run.runId}`)).json<RunDetailResponse>();
    expect(detail.events.map((e) => e.id)).toEqual(events.map((e) => e.id));
    expect(detail.events[2]).toEqual(events[2]);
    expect(detail.hasMore).toBe(false);

    const states = (await app.fastify.inject(`/runs/${run.runId}/agents`)).json<AgentState[]>();
    expect(states.find((s) => s.agentId === 'zaki')).toMatchObject({
      status: 'done',
      sessionId: 'sess-z',
      lastActivity: 'Mengedit src/main.ts',
      lastEventAt: new Date(t0 + 5).toISOString(),
      usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 300, cacheCreationTokens: 40 },
    });
    // lulu belum selesai → run masih running
    expect(repo.getRun(run.runId)!.status).toBe('running');
    await post(
      ev(run.runId, 'lulu', {
        type: 'agent.status_change',
        payload: { from: 'working', to: 'done', reason: '' },
      }),
    );
    expect(repo.getRun(run.runId)).toMatchObject({
      status: 'completed',
      endedAt: expect.any(String),
    });
  });

  it('paginasi dengan kursor', async () => {
    const run = await startRun();
    for (let i = 0; i < 5; i++) {
      await post(
        ev(run.runId, 'lulu', {
          type: 'agent.message',
          payload: { text: `m${i}`, partial: false },
        }),
      );
    }
    const p1 = (await app.fastify.inject(`/runs/${run.runId}?limit=3`)).json<RunDetailResponse>();
    expect(p1.events).toHaveLength(3);
    expect(p1.hasMore).toBe(true);
    const p2 = (
      await app.fastify.inject(`/runs/${run.runId}?limit=3&after=${p1.nextCursor}`)
    ).json<RunDetailResponse>();
    expect(p2.events.map((e) => (e.type === 'agent.message' ? e.payload.text : ''))).toEqual([
      'm3',
      'm4',
    ]);
    expect(p2.hasMore).toBe(false);
    const p3 = (
      await app.fastify.inject(`/runs/${run.runId}?after=${p2.nextCursor}`)
    ).json<RunDetailResponse>();
    expect(p3).toMatchObject({ events: [], nextCursor: p2.nextCursor, hasMore: false });
  });

  it('event invalid → 400, run/agent tak dikenal → 404', async () => {
    const run = await startRun();
    expect((await post({ hello: 'dunia' })).statusCode).toBe(400);
    expect(
      (
        await post({
          ...ev(run.runId, 'lulu', { type: 'agent.error', payload: { message: 'x' } }),
          id: 'bukan-uuid',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await post(ev('run-lain', 'lulu', { type: 'agent.error', payload: { message: 'x' } })))
        .statusCode,
    ).toBe(404);
    expect(
      (await post(ev(run.runId, 'hantu', { type: 'agent.error', payload: { message: 'x' } })))
        .statusCode,
    ).toBe(404);
    expect((await app.fastify.inject('/runs/tidak-ada')).statusCode).toBe(404);
  });
});

describe('stop, hook-ingest, pemulihan', () => {
  it('POST stop meneruskan ke runner; agent tak dikenal 404', async () => {
    const run = await startRun();
    const r = await app.fastify.inject({
      method: 'POST',
      url: `/runs/${run.runId}/agents/lulu/stop`,
    });
    expect(r.statusCode).toBe(202);
    expect(runner.stopped).toEqual([`${run.runId}/lulu`]);
    expect(
      (await app.fastify.inject({ method: 'POST', url: `/runs/${run.runId}/agents/x/stop` }))
        .statusCode,
    ).toBe(404);
  });

  it('/hook-ingest meneruskan body ke handleHook', async () => {
    const r = await app.fastify.inject({
      method: 'POST',
      url: '/hook-ingest',
      payload: { a: 1 },
      headers: { 'x-aethera-token': 't' },
    });
    expect(r.statusCode).toBe(204);
    expect(hooks.at(-1)).toEqual({ a: 1 });
  });

  it('run "running" saat server start → agent aktif error "server restart", run failed', async () => {
    const run = await startRun();
    await post(
      ev(run.runId, 'lulu', {
        type: 'agent.status_change',
        payload: { from: 'idle', to: 'done', reason: '' },
      }),
    );
    expect(runs.recoverStaleRuns()).toEqual([run.runId]);
    const states = repo.listAgentStates(run.runId);
    expect(states.map((s) => [s.agentId, s.status])).toEqual([
      ['lulu', 'done'],
      ['zaki', 'error'],
    ]);
    expect(states[1]!.lastActivity).toBe('Error: server restart');
    expect(repo.getRun(run.runId)!.status).toBe('failed');
    expect(runs.recoverStaleRuns()).toEqual([]);
  });
});

describe('Socket.io', () => {
  let client: Socket | null = null;
  afterEach(() => {
    client?.close();
    client = null;
  });

  it('client di room run:<id> menerima event; room lain tidak', async () => {
    await app.fastify.listen({ port: 0, host: '127.0.0.1' });
    const port = (app.fastify.server.address() as AddressInfo).port;
    const run = await startRun();
    client = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'] });
    const joined = await new Promise<boolean>((r) =>
      client!.emit(SOCKET_EVENTS.join, { runId: run.runId }, r),
    );
    expect(joined).toBe(true);

    const received: AgentEvent[] = [];
    const runUpdates: RunSummary[] = [];
    client.on(SOCKET_EVENTS.agentEvent, (e: AgentEvent) => received.push(e));
    client.on(SOCKET_EVENTS.runUpdated, (r: RunSummary) => runUpdates.push(r));

    const e1 = ev(run.runId, 'lulu', {
      type: 'agent.message',
      payload: { text: 'halo', partial: false },
    });
    await post(e1);
    const other = await startRun();
    await post(
      ev(other.runId, 'lulu', { type: 'agent.message', payload: { text: 'lain', partial: false } }),
    );
    await post(
      ev(run.runId, 'lulu', {
        type: 'agent.status_change',
        payload: { from: 'working', to: 'done', reason: '' },
      }),
    );
    await post(
      ev(run.runId, 'zaki', {
        type: 'agent.status_change',
        payload: { from: 'working', to: 'done', reason: '' },
      }),
    );

    await expect.poll(() => received.length).toBe(3);
    expect(received[0]).toEqual(e1);
    await expect
      .poll(() => runUpdates.some((r) => r.runId === run.runId && r.status === 'completed'))
      .toBe(true);
  });
});
