import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildRelayBody } from '../src/body';

const RELAY = fileURLToPath(new URL('../dist/relay.js', import.meta.url));
const HOOKS = readFileSync(
  fileURLToPath(
    new URL('../../../apps/server/test/__fixtures__/hooks-success.ndjson', import.meta.url),
  ),
  'utf8',
)
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as Record<string, unknown>);

function runRelay(input: string, env: Record<string, string>) {
  return new Promise<{ code: number | null; stdout: string; ms: number }>((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [RELAY], { env: { ...process.env, ...env } });
    let stdout = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.on('close', (code) => resolve({ code, stdout, ms: Date.now() - started }));
    child.stdin.end(input);
  });
}

function listen(server: Server): Promise<number> {
  return new Promise((r) =>
    server.listen(0, '127.0.0.1', () => {
      const a = server.address();
      r(typeof a === 'object' && a ? a.port : 0);
    }),
  );
}

describe('buildRelayBody', () => {
  it('meringkas tool_input Write jadi path relatif dan membuang isi file', () => {
    const pre = HOOKS.find((h) => h.hook_event_name === 'PreToolUse')!;
    const body = buildRelayBody(pre, { AETHERA_RUN_ID: 'r1', AETHERA_AGENT_ID: 'lulu' });
    expect(body.tool_input_summary).toBe('hello.txt');
    expect(body).not.toHaveProperty('tool_input');
    expect(body).toMatchObject({ run_id: 'r1', agent_id: 'lulu', tool_name: 'Write' });
  });

  it('meneruskan duration_ms dan ringkasan respons PostToolUse Bash', () => {
    const post = HOOKS.filter((h) => h.hook_event_name === 'PostToolUse')[1]!;
    const body = buildRelayBody(post, {});
    expect(body.duration_ms).toBe(333);
    expect(body.tool_response_summary).toBe('hello.txt');
  });
});

describe('relay.js (proses sungguhan)', () => {
  let server: Server | null = null;
  beforeAll(() => {
    // dist harus sudah di-build (pnpm test menjalankan build:packages lebih dulu).
    readFileSync(RELAY);
  });
  afterEach(() => {
    server?.closeAllConnections();
    server?.close();
    server = null;
  });

  it('POST ke orchestrator dengan token, exit 0, stdout kosong', async () => {
    let received: { token?: string; body?: Record<string, unknown> } = {};
    server = createServer((req, res) => {
      let data = '';
      req.on('data', (c: Buffer) => (data += c.toString()));
      req.on('end', () => {
        received = { token: req.headers['x-aethera-token'] as string, body: JSON.parse(data) };
        res.writeHead(204).end();
      });
    });
    const port = await listen(server);
    const r = await runRelay(JSON.stringify(HOOKS[1]), {
      AETHERA_HOOK_URL: `http://127.0.0.1:${port}/hook-ingest`,
      AETHERA_HOOK_TOKEN: 'rahasia',
    });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
    expect(received.token).toBe('rahasia');
    expect(received.body?.hook_event_name).toBe('PreToolUse');
  });

  it('server menggantung → tetap exit 0 dalam ~1 detik', async () => {
    server = createServer(() => {
      /* tidak pernah membalas */
    });
    const port = await listen(server);
    const r = await runRelay(JSON.stringify(HOOKS[1]), {
      AETHERA_HOOK_URL: `http://127.0.0.1:${port}/hook-ingest`,
    });
    expect(r.code).toBe(0);
    expect(r.ms).toBeLessThan(1900);
  });

  it('orchestrator mati / stdin bukan JSON / URL kosong → exit 0', async () => {
    expect((await runRelay('{}', { AETHERA_HOOK_URL: 'http://127.0.0.1:1/x' })).code).toBe(0);
    expect((await runRelay('bukan json', { AETHERA_HOOK_URL: 'http://127.0.0.1:1/x' })).code).toBe(
      0,
    );
    expect((await runRelay('{}', { AETHERA_HOOK_URL: '' })).code).toBe(0);
  });
});
