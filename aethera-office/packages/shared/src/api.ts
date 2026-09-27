import { z } from 'zod';
import { agentDefinitionSchema, agentStatusSchema, runSummarySchema } from './agent';
import { agentEventSchema, tokenUsageSchema } from './events';

export const MAX_AGENTS_PER_RUN = 12;
export const TASK_MAX = 10_000;

export const startRunRequestSchema = z
  .object({
    agents: z.array(agentDefinitionSchema).min(1).max(MAX_AGENTS_PER_RUN),
    tasks: z.record(z.string(), z.string().trim().min(1).max(TASK_MAX)),
  })
  .superRefine((body, ctx) => {
    const ids = body.agents.map((a) => a.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['agents'], message: 'id agent harus unik' });
    }
    for (const id of ids) {
      if (!body.tasks[id]) {
        ctx.addIssue({ code: 'custom', path: ['tasks', id], message: `tugas untuk ${id} kosong` });
      }
    }
    for (const id of Object.keys(body.tasks)) {
      if (!ids.includes(id)) {
        ctx.addIssue({ code: 'custom', path: ['tasks', id], message: `agent ${id} tidak ada` });
      }
    }
  });
export type StartRunRequest = z.infer<typeof startRunRequestSchema>;

export const agentStateSchema = z.object({
  runId: z.string(),
  agentId: z.string(),
  status: agentStatusSchema,
  task: z.string(),
  sessionId: z.string().nullable(),
  lastActivity: z.string(),
  lastEventAt: z.iso.datetime().nullable(),
  usage: tokenUsageSchema,
});
export type AgentState = z.infer<typeof agentStateSchema>;

export const runDetailResponseSchema = z.object({
  run: runSummarySchema,
  events: z.array(agentEventSchema),
  /** Kursor event terakhir di halaman ini; kirim sebagai ?after= untuk lanjut. */
  nextCursor: z.int().min(0),
  hasMore: z.boolean(),
});
export type RunDetailResponse = z.infer<typeof runDetailResponseSchema>;

/** Nama event Socket.io server → client. */
export const SOCKET_EVENTS = {
  join: 'join',
  leave: 'leave',
  agentEvent: 'agent-event',
  runUpdated: 'run-updated',
} as const;
