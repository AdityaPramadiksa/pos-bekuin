import { z } from 'zod';

export const AGENT_STATUSES = ['idle', 'working', 'blocked', 'error', 'done'] as const;
export const agentStatusSchema = z.enum(AGENT_STATUSES);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const agentDefinitionSchema = z.object({
  /** Slug unik dalam satu run, dipakai sebagai agentId di event. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'id agent harus slug huruf kecil/angka/-'),
  name: z.string().min(1).max(40),
  role: z.string().min(1).max(80),
  deskPosition: z.object({ x: z.int(), z: z.int() }),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'warna harus hex #RRGGBB'),
});
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;

export const RUN_STATUSES = ['running', 'completed', 'failed'] as const;
export const runStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runSummarySchema = z.object({
  runId: z.string().min(1),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  agents: z.array(agentDefinitionSchema),
  status: runStatusSchema,
});
export type RunSummary = z.infer<typeof runSummarySchema>;
