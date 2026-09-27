import { randomBytes } from 'node:crypto';
import { buildApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db/database';
import { Repository } from './db/repository';
import { InProcessEventBus } from './event-bus';
import { EventPipeline } from './event-pipeline';
import { resolveRelayPath } from './orchestrator/hook-settings';
import { AgentProcessManager } from './orchestrator/process-manager';
import { RunService } from './run-service';

/*
 * Orchestrator dan server berjalan di proses yang sama: satu mesin, satu pengguna, jadi tidak
 * perlu HTTP internal atau Redis. Event manager langsung masuk EventPipeline.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);
  const repo = new Repository(db);
  const bus = new InProcessEventBus();
  const pipeline = new EventPipeline(repo, bus);

  const manager = new AgentProcessManager({
    relayPath: resolveRelayPath(),
    // Hook selalu lewat loopback walau HOST di-set lain.
    hookUrl: `http://127.0.0.1:${config.port}/hook-ingest`,
    hookToken: randomBytes(24).toString('hex'),
    claudeBin: config.claudeBin,
    model: config.model,
    allowedTools: config.allowedTools,
    permissionMode: config.permissionMode,
    log: (m) => console.warn(`[orchestrator] ${m}`),
  });
  manager.on('event', (e) => {
    const r = pipeline.ingest(e);
    if (!r.ok) console.warn(`[orchestrator] event ditolak (${r.reason})`, e.type, e.agentId);
  });

  const runs = new RunService(repo, pipeline, bus, manager, {
    workspacesDir: config.workspacesDir,
  });
  const stale = runs.recoverStaleRuns();
  if (stale.length)
    console.warn(`[server] ${stale.length} run lama ditandai gagal (server restart)`);

  const { fastify } = buildApp({
    repo,
    bus,
    pipeline,
    runs,
    handleHook: (b, t) => manager.handleHook(b, t),
    logger: true,
  });

  const shutdown = async (signal: string) => {
    fastify.log.info(`${signal}: menghentikan semua agent`);
    manager.stopAll();
    await fastify.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Hook memanggil 127.0.0.1, jadi HOST harus mencakup loopback (default 127.0.0.1).
  await fastify.listen({ port: config.port, host: config.host });
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
