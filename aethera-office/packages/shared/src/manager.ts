import { z } from 'zod';

export const ROADMAP_STATUSES = ['pending', 'in_progress', 'done'] as const;
export const roadmapStatusSchema = z.enum(ROADMAP_STATUSES);
export type RoadmapStatus = z.infer<typeof roadmapStatusSchema>;

export const roadmapItemSchema = z.object({
  id: z.string(),
  runId: z.string(),
  title: z.string(),
  assignedAgentId: z.string().nullable(),
  status: roadmapStatusSchema,
  progressPct: z.int().min(0).max(100),
  sortOrder: z.int(),
});
export type RoadmapItem = z.infer<typeof roadmapItemSchema>;

export const createRoadmapItemSchema = z.object({
  title: z.string().trim().min(1, 'judul wajib diisi').max(200),
  assignedAgentId: z.string().min(1).nullable().default(null),
});
export type CreateRoadmapItem = z.input<typeof createRoadmapItemSchema>;

export const updateRoadmapItemSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    assignedAgentId: z.string().min(1).nullable(),
    status: roadmapStatusSchema,
    progressPct: z.int().min(0).max(100),
    sortOrder: z.int(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'tidak ada perubahan');
export type UpdateRoadmapItem = z.infer<typeof updateRoadmapItemSchema>;

export const INSTRUCTION_STATUSES = ['queued', 'sent', 'failed'] as const;
export const instructionStatusSchema = z.enum(INSTRUCTION_STATUSES);
export type InstructionStatus = z.infer<typeof instructionStatusSchema>;

export const managerInstructionSchema = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string(),
  text: z.string(),
  status: instructionStatusSchema,
  /** "resume" = melanjutkan sesi Claude agent; "new" = sesi baru (agent belum punya sesi). */
  mode: z.enum(['resume', 'new']).nullable(),
  createdAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
});
export type ManagerInstruction = z.infer<typeof managerInstructionSchema>;

export const sendInstructionSchema = z.object({
  /** "all" = seluruh tim, atau id satu agent. */
  target: z.string().min(1),
  text: z.string().trim().min(1, 'instruksi kosong').max(10_000),
});
export type SendInstruction = z.infer<typeof sendInstructionSchema>;
