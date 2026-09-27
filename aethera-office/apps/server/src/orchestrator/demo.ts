/**
 * Demo Fase 2: jalankan 2 agent Claude Code headless di folder sementara dan cetak semua
 * AgentEvent. Butuh CLI `claude` yang sudah login (Pro/Max).
 *
 *   pnpm --filter @aethera/server demo            # model default akun
 *   DEMO_MODEL=haiku pnpm --filter @aethera/server demo
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeEvent, type AgentDefinition, type AgentEvent } from '@aethera/shared';
import { createHookIngestServer, listenLocal } from './hook-ingest';
import { resolveRelayPath } from './hook-settings';
import { AgentProcessManager } from './process-manager';

const agents: { def: AgentDefinition; task: string; file: string }[] = [
  {
    def: {
      id: 'lulu',
      name: 'Lulu',
      role: 'Penulis',
      deskPosition: { x: 0, z: 0 },
      color: '#ec4899',
    },
    task: "Buat file hello.txt berisi teks 'halo'. Jawab singkat.",
    file: 'hello.txt',
  },
  {
    def: {
      id: 'zaki',
      name: 'Zaki',
      role: 'Developer',
      deskPosition: { x: 2, z: 0 },
      color: '#22c55e',
    },
    task: 'Buat file angka.txt berisi angka 1 sampai 5, satu per baris. Jawab singkat.',
    file: 'angka.txt',
  },
];

const COLORS: Record<string, string> = { lulu: '\x1b[35m', zaki: '\x1b[32m' };

async function main(): Promise<void> {
  const runId = `demo-${randomUUID().slice(0, 8)}`;
  const logFile = join(process.cwd(), `${runId}.ndjson`);
  const token = randomBytes(16).toString('hex');

  let manager: AgentProcessManager | null = null;
  const hookCounts = new Map<string, number>();
  // Server dibuat lebih dulu untuk mendapatkan port acak; manager dipasang setelahnya.
  const server = createHookIngestServer({
    handleHook: (b, t) => {
      const ok = manager?.handleHook(b, t) ?? false;
      const name = (b as { hook_event_name?: string } | null)?.hook_event_name ?? '?';
      if (ok) hookCounts.set(name, (hookCounts.get(name) ?? 0) + 1);
      return ok;
    },
  });
  const port = await listenLocal(server);

  manager = new AgentProcessManager({
    relayPath: resolveRelayPath(),
    hookUrl: `http://127.0.0.1:${port}/hook-ingest`,
    hookToken: token,
    model: process.env.DEMO_MODEL,
    log: (m) => console.warn(m),
  });

  const counts = new Map<string, number>();
  manager.on('event', (e: AgentEvent) => {
    counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    appendFileSync(logFile, `${JSON.stringify(e)}\n`);
    if (e.type === 'agent.message' && e.payload.partial) return;
    const time = e.timestamp.slice(11, 19);
    const color = COLORS[e.agentId] ?? '';
    console.log(
      `${time} ${color}${e.agentId.padEnd(5)}\x1b[0m ${e.type.padEnd(20)} ${describeEvent(e)}`,
    );
  });

  const dirs = new Map<string, string>();
  const done = new Promise<void>((resolve) => {
    let remaining = agents.length;
    manager!.on('exit', () => {
      remaining -= 1;
      if (remaining === 0) resolve();
    });
  });

  for (const a of agents) {
    const dir = mkdtempSync(join(tmpdir(), `aethera-${a.def.id}-`));
    dirs.set(a.def.id, dir);
    manager.spawnAgent({ runId, agent: a.def, task: a.task, workingDir: dir });
  }

  await done;
  server.close();

  console.log('\nRingkasan event:', Object.fromEntries(counts));
  console.log('Hook diterima:', Object.fromEntries(hookCounts));
  for (const a of agents) {
    const path = join(dirs.get(a.def.id)!, a.file);
    try {
      console.log(`${a.file}: ${JSON.stringify(readFileSync(path, 'utf8'))}`);
    } catch {
      console.log(`${a.file}: TIDAK ADA di ${path}`);
    }
  }
  console.log(`Log NDJSON: ${logFile}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
