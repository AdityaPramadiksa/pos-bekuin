import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { agentEventSchema, type AgentDefinition, type AgentEvent } from '@aethera/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRelayBody } from '../../../../packages/hook-relay/src/body';
import { AgentProcessManager } from '../../src/orchestrator/process-manager';
import { fixtureLines } from '../helpers';

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed: NodeJS.Signals[] = [];
  kill(sig: NodeJS.Signals = 'SIGTERM') {
    this.killed.push(sig);
    return true;
  }
  /** Tulis baris stdout lalu tunggu readline memprosesnya. */
  async write(lines: string[]) {
    for (const l of lines) this.stdout.write(`${l}\n`);
    await new Promise((r) => setImmediate(r));
  }
  async exit(code: number | null, signal: NodeJS.Signals | null = null) {
    this.stdout.end();
    this.stderr.end();
    await new Promise((r) => setImmediate(r));
    this.emit('close', code, signal);
  }
}

const agent: AgentDefinition = {
  id: 'lulu',
  name: 'Lulu',
  role: 'Penulis',
  deskPosition: { x: 0, z: 0 },
  color: '#ec4899',
};
const SESSION = '1e613ffb-f654-4388-9a24-61b45fed2206';
const STREAM = fixtureLines('stream-success.ndjson');
/** Baris sampai dan termasuk system/init (session id baru dikenal setelah init). */
const UNTIL_INIT = STREAM.slice(0, STREAM.findIndex((l) => l.includes('"subtype": "init"')) + 1);

function setup(opts: Partial<ConstructorParameters<typeof AgentProcessManager>[0]> = {}) {
  const children: FakeChild[] = [];
  const calls: { cmd: string; args: string[]; opts: SpawnOptions }[] = [];
  const manager = new AgentProcessManager({
    relayPath: '/opt/relay.js',
    hookUrl: 'http://127.0.0.1:9/hook-ingest',
    hookToken: 'tok',
    messageThrottleMs: 300,
    spawnFn: (cmd, args, o) => {
      calls.push({ cmd, args, opts: o });
      const c = new FakeChild();
      children.push(c);
      return c as unknown as ChildProcess;
    },
    ...opts,
  });
  const events: AgentEvent[] = [];
  manager.on('event', (e) => events.push(e));
  return { manager, children, calls, events };
}

const types = (events: AgentEvent[]) =>
  events.filter((e) => !(e.type === 'agent.message' && e.payload.partial)).map((e) => e.type);

describe('AgentProcessManager', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'sk-rahasia';
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
    vi.useRealTimers();
  });

  it('argumen CLI & env: headless, izin eksplisit, hook via --settings, tanpa API key', () => {
    const { manager, calls } = setup({
      allowedTools: ['Read', 'Bash(npm test *)'],
      model: 'haiku',
    });
    const { sessionId } = manager.spawnAgent({
      runId: 'r1',
      agent,
      task: 'tugas',
      workingDir: '/tmp/ws',
    });
    const { cmd, args, opts } = calls[0]!;
    expect(cmd).toBe('claude');
    expect(args.slice(0, 5)).toEqual([
      '-p',
      'tugas',
      '--output-format',
      'stream-json',
      '--verbose',
    ]);
    const flag = (f: string) => args[args.indexOf(f) + 1];
    expect(flag('--session-id')).toBe(sessionId);
    expect(flag('--permission-mode')).toBe('acceptEdits');
    expect(flag('--allowedTools')).toBe('Read,Bash(npm test *)');
    expect(flag('--permission-prompts')).toBe('none');
    expect(flag('--model')).toBe('haiku');
    expect(args).toContain('--include-partial-messages');
    const settings = JSON.parse(flag('--settings')!) as { hooks: Record<string, unknown> };
    expect(Object.keys(settings.hooks)).toEqual(
      expect.arrayContaining(['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Notification']),
    );
    expect(JSON.stringify(settings)).toContain("'/opt/relay.js'");
    expect(opts.cwd).toBe('/tmp/ws');
    expect(opts.stdio).toEqual(['ignore', 'pipe', 'pipe']);
    expect(opts.env?.ANTHROPIC_API_KEY).toBeUndefined();
    expect(opts.env).toMatchObject({
      AETHERA_HOOK_TOKEN: 'tok',
      AETHERA_RUN_ID: 'r1',
      AETHERA_AGENT_ID: 'lulu',
    });
    expect(args).not.toContain('bypassPermissions');
  });

  it('--resume memakai session id lama', () => {
    const { manager, calls } = setup();
    manager.spawnAgent({
      runId: 'r1',
      agent,
      task: 'lanjut',
      workingDir: '/tmp/ws',
      resumeSessionId: 'sess-lama',
    });
    const args = calls[0]!.args;
    expect(args[args.indexOf('--resume') + 1]).toBe('sess-lama');
    expect(args).not.toContain('--session-id');
  });

  it('run sukses dari fixture: urutan event lengkap, hook + stream tidak dobel', async () => {
    const { manager, children, events } = setup();
    manager.spawnAgent({ runId: 'r1', agent, task: 't', workingDir: '/tmp/aethera-demo/ws' });
    const child = children[0]!;
    const hooks = fixtureLines('hooks-success.ndjson').map((l) =>
      buildRelayBody(JSON.parse(l), {}),
    );

    // Hook datang lebih dulu untuk tool pertama, stream lebih dulu untuk tool kedua.
    await child.write(UNTIL_INIT);
    for (const h of hooks.slice(0, 3)) expect(manager.handleHook(h, 'tok')).toBe(true);
    await child.write(STREAM.slice(UNTIL_INIT.length));
    for (const h of hooks.slice(3)) manager.handleHook(h, 'tok');
    await child.exit(0);

    for (const e of events) expect(agentEventSchema.safeParse(e).success).toBe(true);
    expect(types(events)).toEqual([
      'agent.status_change',
      'agent.session_start',
      'agent.tool_pre',
      'agent.tool_post',
      'agent.tool_pre',
      'agent.tool_post',
      'agent.message',
      'agent.session_end',
      'agent.status_change',
    ]);
    const firstPost = events.find((e) => e.type === 'agent.tool_post');
    expect(firstPost).toMatchObject({ payload: { toolName: 'Write' } });
    expect(events.at(-2)).toMatchObject({
      type: 'agent.session_end',
      payload: { exitCode: 0, numTurns: 3, usage: { outputTokens: 462, cacheReadTokens: 81674 } },
    });
    expect(events.at(-1)).toMatchObject({ payload: { from: 'working', to: 'done' } });
    expect(manager.isRunning('r1', 'lulu')).toBe(false);
    expect(manager.getSessionId('r1', 'lulu')).toBe(SESSION);
  });

  it('hook dengan token salah atau sesi tak dikenal ditolak', async () => {
    const { manager, children } = setup();
    manager.spawnAgent({ runId: 'r1', agent, task: 't', workingDir: '/tmp/ws' });
    await children[0]!.write(UNTIL_INIT);
    const hook = {
      session_id: SESSION,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_use_id: 'x',
    };
    expect(manager.handleHook(hook, 'salah')).toBe(false);
    expect(manager.handleHook({ ...hook, session_id: 'lain' }, 'tok')).toBe(false);
    expect(
      manager.handleHook({ ...hook, session_id: 'lain', run_id: 'r1', agent_id: 'lulu' }, 'tok'),
    ).toBe(true);
    expect(manager.handleHook('bukan objek', 'tok')).toBe(false);
  });

  it('Notification izin → blocked, tool berikutnya → working lagi', async () => {
    const { manager, children, events } = setup();
    manager.spawnAgent({ runId: 'r1', agent, task: 't', workingDir: '/tmp/ws' });
    await children[0]!.write(UNTIL_INIT);
    manager.handleHook(
      {
        session_id: SESSION,
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt',
        message: 'Izin Bash',
      },
      'tok',
    );
    manager.handleHook(
      { session_id: SESSION, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'x' },
      'tok',
    );
    const statuses = events
      .filter((e) => e.type === 'agent.status_change')
      .map((e) => (e.type === 'agent.status_change' ? e.payload.to : ''));
    expect(statuses).toEqual(['working', 'blocked', 'working']);
  });

  it('exit code != 0 tanpa result → agent.error berisi stderr, status error', async () => {
    const { manager, children, events } = setup();
    manager.spawnAgent({ runId: 'r1', agent, task: 't', workingDir: '/tmp/ws' });
    children[0]!.stderr.write('Error: not logged in\n');
    await children[0]!.exit(1);
    expect(types(events)).toEqual([
      'agent.status_change',
      'agent.error',
      'agent.session_end',
      'agent.status_change',
    ]);
    expect(events[1]).toMatchObject({ payload: { message: 'Error: not logged in' } });
    expect(events.at(-1)).toMatchObject({ payload: { to: 'error' } });
  });

  it('gagal spawn (ENOENT) → error sekali saja walau close juga datang', async () => {
    const { manager, children, events } = setup();
    manager.spawnAgent({ runId: 'r1', agent, task: 't', workingDir: '/tmp/ws' });
    children[0]!.emit('error', new Error('spawn claude ENOENT'));
    await children[0]!.exit(-2);
    expect(events.filter((e) => e.type === 'agent.error')).toHaveLength(1);
    expect(events.find((e) => e.type === 'agent.session_end')).toMatchObject({
      payload: { exitCode: 127 },
    });
  });

  it('stopAgent: SIGTERM lalu SIGKILL setelah timeout; status done "dihentikan"', async () => {
    vi.useFakeTimers();
    const { manager, children, events } = setup({ killTimeoutMs: 5000 });
    manager.spawnAgent({ runId: 'r1', agent, task: 't', workingDir: '/tmp/ws' });
    expect(manager.stopAgent('r1', 'lulu')).toBe(true);
    expect(children[0]!.killed).toEqual(['SIGTERM']);
    vi.advanceTimersByTime(5000);
    expect(children[0]!.killed).toEqual(['SIGTERM', 'SIGKILL']);
    children[0]!.emit('close', null, 'SIGKILL');
    expect(events.find((e) => e.type === 'agent.session_end')).toMatchObject({
      payload: { exitCode: 137 },
    });
    expect(events.at(-1)).toMatchObject({ payload: { to: 'done', reason: 'dihentikan manager' } });
    expect(events.some((e) => e.type === 'agent.error')).toBe(false);
    expect(manager.stopAgent('r1', 'lulu')).toBe(false);
  });

  it('tidak bisa spawn agent yang sama dua kali selagi berjalan', () => {
    const { manager } = setup();
    manager.spawnAgent({ runId: 'r1', agent, task: 't', workingDir: '/tmp/ws' });
    expect(() =>
      manager.spawnAgent({ runId: 'r1', agent, task: 't', workingDir: '/tmp/ws' }),
    ).toThrow(/masih berjalan/);
  });

  it('delta teks di-throttle: satu event parsial per interval, dibuang saat pesan utuh datang', async () => {
    const { manager, children, events } = setup({ messageThrottleMs: 50 });
    manager.spawnAgent({ runId: 'r1', agent, task: 't', workingDir: '/tmp/ws' });
    const delta = (text: string) =>
      JSON.stringify({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
      });
    await children[0]!.write(['Ha', 'lo ', 'du', 'nia'].map(delta));
    await new Promise((r) => setTimeout(r, 80));
    await children[0]!.write([delta('!')]);
    await children[0]!.write([
      JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Halo dunia!' }] },
      }),
    ]);
    await new Promise((r) => setTimeout(r, 80));
    const msgs = events.filter((e) => e.type === 'agent.message');
    expect(
      msgs.map((e) => (e.type === 'agent.message' ? [e.payload.text, e.payload.partial] : [])),
    ).toEqual([
      ['Halo dunia', true],
      ['Halo dunia!', false],
    ]);
  });
});
