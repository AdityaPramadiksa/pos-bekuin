import { z } from 'zod';
import { agentStatusSchema } from './agent';

export const TOOL_SUMMARY_MAX = 500;
export const MESSAGE_TEXT_MAX = 1000;

const nonNegInt = z.int().min(0);

export const tokenUsageSchema = z.object({
  inputTokens: nonNegInt,
  outputTokens: nonNegInt,
  cacheReadTokens: nonNegInt,
  cacheCreationTokens: nonNegInt,
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

const baseFields = {
  id: z.uuid(),
  runId: z.string().min(1),
  agentId: z.string().min(1),
  timestamp: z.iso.datetime(),
};

export const sessionStartEventSchema = z.object({
  ...baseFields,
  type: z.literal('agent.session_start'),
  payload: z.object({ sessionId: z.string().min(1), model: z.string(), cwd: z.string() }),
});

export const toolPreEventSchema = z.object({
  ...baseFields,
  type: z.literal('agent.tool_pre'),
  payload: z.object({
    toolUseId: z.string().min(1),
    toolName: z.string().min(1),
    inputSummary: z.string().max(TOOL_SUMMARY_MAX),
  }),
});

export const toolPostEventSchema = z.object({
  ...baseFields,
  type: z.literal('agent.tool_post'),
  payload: z.object({
    toolUseId: z.string().min(1),
    toolName: z.string().min(1),
    success: z.boolean(),
    durationMs: nonNegInt.nullable(),
    resultSummary: z.string().max(TOOL_SUMMARY_MAX),
  }),
});

export const messageEventSchema = z.object({
  ...baseFields,
  type: z.literal('agent.message'),
  payload: z.object({ text: z.string().max(MESSAGE_TEXT_MAX), partial: z.boolean() }),
});

export const statusChangeEventSchema = z.object({
  ...baseFields,
  type: z.literal('agent.status_change'),
  payload: z.object({ from: agentStatusSchema, to: agentStatusSchema, reason: z.string() }),
});

export const sessionEndEventSchema = z.object({
  ...baseFields,
  type: z.literal('agent.session_end'),
  payload: z.object({
    exitCode: z.int(),
    durationMs: nonNegInt,
    numTurns: nonNegInt,
    usage: tokenUsageSchema,
  }),
});

export const errorEventSchema = z.object({
  ...baseFields,
  type: z.literal('agent.error'),
  payload: z.object({ message: z.string().min(1) }),
});

export const agentEventSchema = z.discriminatedUnion('type', [
  sessionStartEventSchema,
  toolPreEventSchema,
  toolPostEventSchema,
  messageEventSchema,
  statusChangeEventSchema,
  sessionEndEventSchema,
  errorEventSchema,
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;
export type AgentEventType = AgentEvent['type'];
export type AgentEventOf<T extends AgentEventType> = Extract<AgentEvent, { type: T }>;
export type AgentEventPayload<T extends AgentEventType> = AgentEventOf<T>['payload'];

export const AGENT_EVENT_TYPES = agentEventSchema.options.map(
  (o) => o.shape.type.value,
) as AgentEventType[];

/** Tambahkan dua ringkasan token. */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
  };
}
