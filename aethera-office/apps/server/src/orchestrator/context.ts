import { randomUUID } from 'node:crypto';
import type { AgentEvent, AgentEventType, AgentEventPayload } from '@aethera/shared';

/** Identitas + sumber waktu/id yang dipakai penerjemah event (disuntik supaya bisa dites). */
export interface EventContext {
  runId: string;
  agentId: string;
  /** Folder kerja agent, untuk meringkas path jadi relatif. */
  cwd: string;
  now: () => Date;
  newId: () => string;
}

export function defaultClock(): Pick<EventContext, 'now' | 'newId'> {
  return { now: () => new Date(), newId: () => randomUUID() };
}

export function makeEvent<T extends AgentEventType>(
  ctx: EventContext,
  type: T,
  payload: AgentEventPayload<T>,
): Extract<AgentEvent, { type: T }> {
  return {
    id: ctx.newId(),
    runId: ctx.runId,
    agentId: ctx.agentId,
    timestamp: ctx.now().toISOString(),
    type,
    payload,
  } as Extract<AgentEvent, { type: T }>;
}
