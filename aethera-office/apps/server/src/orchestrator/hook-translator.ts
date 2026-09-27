/**
 * Penerjemah payload hook Claude Code (diteruskan hook-relay) → AgentEvent.
 *
 * Field dikonfirmasi dari code.claude.com/docs/en/hooks dan rekaman run sungguhan
 * (test/__fixtures__/hooks-success.ndjson):
 * - umum: session_id, transcript_path, cwd, permission_mode, hook_event_name
 * - PreToolUse: tool_name, tool_input, tool_use_id
 * - PostToolUse: + tool_response (objek, bentuk per tool), duration_ms
 * - PostToolUseFailure: + tool_error
 * - Notification: notification_type ("permission_prompt", "idle_prompt", ...), message
 * - SessionStart: source ("startup" | "resume" | ...) — di rekaman field-nya `source`
 * - Stop: last_assistant_message, stop_hook_active
 * TIDAK ada runId/agentId: pemetaan lewat session_id (lihat AgentProcessManager).
 *
 * hook-relay sudah meringkas tool_input/tool_response jadi `tool_input_summary` dan
 * `tool_response_summary` supaya payload besar (isi file Write) tidak ikut terkirim.
 */
import { TOOL_SUMMARY_MAX, truncate, type AgentEvent } from '@aethera/shared';
import { makeEvent, type EventContext } from './context';

export interface RelayedHook {
  session_id: string;
  hook_event_name: string;
  cwd?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input_summary?: string;
  tool_response_summary?: string;
  tool_error?: string;
  duration_ms?: number;
  notification_type?: string;
  message?: string;
  /** Dari env AETHERA_RUN_ID/AETHERA_AGENT_ID proses agent; cadangan pemetaan. */
  run_id?: string;
  agent_id?: string;
}

export function isRelayedHook(v: unknown): v is RelayedHook {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.session_id === 'string' && typeof o.hook_event_name === 'string';
}

export interface HookState {
  /** Waktu tool_pre per toolUseId (ms) untuk menghitung durasi bila duration_ms tidak ada. */
  toolStarts: Map<string, { name: string; startedAt: number }>;
}

export function createHookState(): HookState {
  return { toolStarts: new Map() };
}

export type HookTranslation =
  | { kind: 'events'; events: AgentEvent[] }
  /** Notification izin: AgentProcessManager yang tahu status saat ini, jadi dia yang memancarkan status_change. */
  | { kind: 'blocked'; reason: string }
  | { kind: 'ignored' };

export function translateHook(
  hook: RelayedHook,
  ctx: EventContext,
  state: HookState,
): HookTranslation {
  const toolName = hook.tool_name || 'tool';
  switch (hook.hook_event_name) {
    case 'PreToolUse': {
      if (!hook.tool_use_id) return { kind: 'ignored' };
      state.toolStarts.set(hook.tool_use_id, { name: toolName, startedAt: ctx.now().getTime() });
      return {
        kind: 'events',
        events: [
          makeEvent(ctx, 'agent.tool_pre', {
            toolUseId: hook.tool_use_id,
            toolName,
            inputSummary: truncate(hook.tool_input_summary ?? '', TOOL_SUMMARY_MAX),
          }),
        ],
      };
    }
    case 'PostToolUse':
    case 'PostToolUseFailure': {
      if (!hook.tool_use_id) return { kind: 'ignored' };
      const start = state.toolStarts.get(hook.tool_use_id);
      state.toolStarts.delete(hook.tool_use_id);
      const durationMs =
        typeof hook.duration_ms === 'number' && hook.duration_ms >= 0
          ? Math.round(hook.duration_ms)
          : start
            ? Math.max(0, ctx.now().getTime() - start.startedAt)
            : null;
      const failed = hook.hook_event_name === 'PostToolUseFailure';
      return {
        kind: 'events',
        events: [
          makeEvent(ctx, 'agent.tool_post', {
            toolUseId: hook.tool_use_id,
            toolName,
            success: !failed,
            durationMs,
            resultSummary: truncate(
              (failed ? hook.tool_error : hook.tool_response_summary) ?? '',
              TOOL_SUMMARY_MAX,
            ),
          }),
        ],
      };
    }
    case 'Notification': {
      if (hook.notification_type === 'permission_prompt') {
        return { kind: 'blocked', reason: truncate(hook.message || 'Menunggu izin', 200) };
      }
      return { kind: 'ignored' };
    }
    default:
      // SessionStart & Stop sudah terwakili oleh system/init dan result di stream-json.
      return { kind: 'ignored' };
  }
}
