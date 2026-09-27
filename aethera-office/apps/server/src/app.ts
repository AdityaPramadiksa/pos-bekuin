import cors from '@fastify/cors';
import {
  SOCKET_EVENTS,
  createRoadmapItemSchema,
  sendInstructionSchema,
  startRunRequestSchema,
  updateRoadmapItemSchema,
} from '@aethera/shared';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { Server as SocketServer } from 'socket.io';
import { z } from 'zod';
import type { Repository } from './db/repository';
import type { EventBus } from './event-bus';
import type { EventPipeline } from './event-pipeline';
import type { InstructionService } from './instruction-service';
import type { RoadmapError, RoadmapService } from './roadmap-service';
import type { RunService } from './run-service';

export interface AppDeps {
  repo: Repository;
  bus: EventBus;
  pipeline: EventPipeline;
  runs: RunService;
  roadmap: RoadmapService;
  instructions: InstructionService;
  /** Penerima body hook-relay (AgentProcessManager.handleHook). */
  handleHook: (body: unknown, token: string | undefined) => boolean;
  logger?: boolean;
}

export interface App {
  fastify: FastifyInstance;
  io: SocketServer;
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function badRequest(reply: FastifyReply, issues: z.core.$ZodIssue[]) {
  return reply.status(400).send({
    message: 'Data tidak valid',
    issues: issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });
const eventsQuery = z.object({
  after: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});
const ROADMAP_ERROR: Record<RoadmapError, [number, string]> = {
  run_not_found: [404, 'Run tidak ditemukan'],
  item_not_found: [404, 'Item roadmap tidak ditemukan'],
  agent_not_in_run: [400, 'Agent tidak ada di run ini'],
};

const joinPayload = z.object({ runId: z.string().min(1).max(100) });

export function buildApp(deps: AppDeps): App {
  const { repo, bus, pipeline, runs, roadmap, instructions } = deps;
  const fastify = Fastify({ logger: deps.logger ?? false, bodyLimit: 1024 * 1024 });
  void fastify.register(cors, { origin: LOCAL_ORIGIN });

  fastify.get('/health', async () => ({ ok: true }));

  fastify.post('/hook-ingest', async (req, reply) => {
    const token = req.headers['x-aethera-token'];
    const ok = deps.handleHook(req.body, Array.isArray(token) ? token[0] : token);
    // Selalu cepat; relay tidak peduli hasilnya.
    return reply.status(ok ? 204 : 202).send();
  });

  fastify.post('/events', async (req, reply) => {
    const result = pipeline.ingest(req.body);
    if (result.ok) return reply.status(result.duplicate ? 200 : 201).send({ id: result.event.id });
    if (result.reason === 'invalid') return badRequest(reply, result.issues);
    return reply.status(404).send({
      message:
        result.reason === 'unknown_run' ? 'Run tidak ditemukan' : 'Agent tidak ada di run ini',
    });
  });

  fastify.post('/runs', async (req, reply) => {
    const parsed = startRunRequestSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    return reply.status(201).send(runs.startRun(parsed.data));
  });

  fastify.get('/runs', async (req, reply) => {
    const q = listQuery.safeParse(req.query);
    if (!q.success) return badRequest(reply, q.error.issues);
    return repo.listRuns(q.data.limit);
  });

  fastify.get<{ Params: { runId: string } }>('/runs/:runId', async (req, reply) => {
    const q = eventsQuery.safeParse(req.query);
    if (!q.success) return badRequest(reply, q.error.issues);
    const run = repo.getRun(req.params.runId);
    if (!run) return reply.status(404).send({ message: 'Run tidak ditemukan' });
    return { run, ...repo.listEvents(run.runId, q.data.after, q.data.limit) };
  });

  fastify.get<{ Params: { runId: string } }>('/runs/:runId/agents', async (req, reply) => {
    if (!repo.getRun(req.params.runId)) {
      return reply.status(404).send({ message: 'Run tidak ditemukan' });
    }
    return repo.listAgentStates(req.params.runId);
  });

  fastify.post<{ Params: { runId: string; agentId: string } }>(
    '/runs/:runId/agents/:agentId/stop',
    async (req, reply) => {
      const { runId, agentId } = req.params;
      if (!repo.getAgentState(runId, agentId)) {
        return reply.status(404).send({ message: 'Agent tidak ditemukan' });
      }
      const stopped = runs.stopAgent(runId, agentId);
      if (stopped) instructions.cancelQueued(runId, agentId);
      return reply
        .status(stopped ? 202 : 409)
        .send(
          stopped ? { message: 'Menghentikan agent' } : { message: 'Agent tidak sedang berjalan' },
        );
    },
  );

  // ---- Roadmap ----
  fastify.get<{ Params: { runId: string } }>('/runs/:runId/roadmap', async (req, reply) => {
    if (!repo.getRun(req.params.runId))
      return reply.status(404).send({ message: 'Run tidak ditemukan' });
    return roadmap.list(req.params.runId);
  });

  fastify.post<{ Params: { runId: string } }>('/runs/:runId/roadmap', async (req, reply) => {
    const parsed = createRoadmapItemSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const result = roadmap.create(req.params.runId, parsed.data);
    if (typeof result === 'string') {
      const [code, message] = ROADMAP_ERROR[result];
      return reply.status(code).send({ message });
    }
    return reply.status(201).send(result);
  });

  fastify.patch<{ Params: { id: string } }>('/roadmap/:id', async (req, reply) => {
    const parsed = updateRoadmapItemSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const result = roadmap.update(req.params.id, parsed.data);
    if (typeof result === 'string') {
      const [code, message] = ROADMAP_ERROR[result];
      return reply.status(code).send({ message });
    }
    return result;
  });

  fastify.delete<{ Params: { id: string } }>('/roadmap/:id', async (req, reply) => {
    if (!roadmap.remove(req.params.id)) {
      return reply.status(404).send({ message: 'Item roadmap tidak ditemukan' });
    }
    return reply.status(204).send();
  });

  // ---- Manager Command Layer ----
  fastify.get<{ Params: { runId: string } }>('/runs/:runId/instructions', async (req, reply) => {
    if (!repo.getRun(req.params.runId))
      return reply.status(404).send({ message: 'Run tidak ditemukan' });
    return instructions.list(req.params.runId);
  });

  fastify.post<{ Params: { runId: string } }>('/runs/:runId/instructions', async (req, reply) => {
    const parsed = sendInstructionSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(reply, parsed.error.issues);
    const result = instructions.send(req.params.runId, parsed.data.target, parsed.data.text);
    if (result === 'run_not_found')
      return reply.status(404).send({ message: 'Run tidak ditemukan' });
    if (result === 'agent_not_in_run') {
      return reply.status(400).send({ message: 'Agent tidak ada di run ini' });
    }
    return reply.status(202).send(result);
  });

  const io = new SocketServer(fastify.server, { cors: { origin: LOCAL_ORIGIN } });
  io.on('connection', (socket) => {
    socket.on(SOCKET_EVENTS.join, (payload: unknown, ack?: (ok: boolean) => void) => {
      const p = joinPayload.safeParse(payload);
      if (p.success) void socket.join(`run:${p.data.runId}`);
      if (typeof ack === 'function') ack(p.success);
    });
    socket.on(SOCKET_EVENTS.leave, (payload: unknown) => {
      const p = joinPayload.safeParse(payload);
      if (p.success) void socket.leave(`run:${p.data.runId}`);
    });
  });

  const unsubscribe = bus.subscribe((msg) => {
    switch (msg.kind) {
      case 'event':
        io.to(`run:${msg.event.runId}`).emit(SOCKET_EVENTS.agentEvent, msg.event);
        break;
      case 'run':
        // Ringkasan run dikirim ke semua client (daftar run di header).
        io.emit(SOCKET_EVENTS.runUpdated, msg.run);
        break;
      case 'roadmap':
        io.to(`run:${msg.runId}`).emit(SOCKET_EVENTS.roadmapUpdated, {
          runId: msg.runId,
          items: msg.items,
        });
        break;
      case 'instruction':
        io.to(`run:${msg.instruction.runId}`).emit(
          SOCKET_EVENTS.instructionUpdated,
          msg.instruction,
        );
        break;
    }
  });
  fastify.addHook('onClose', async () => {
    unsubscribe();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  return { fastify, io };
}
