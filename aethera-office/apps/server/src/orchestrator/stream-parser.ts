/**
 * Penerjemah stdout `claude -p --output-format stream-json --verbose` → AgentEvent.
 *
 * Bentuk pesan dikonfirmasi dari dokumentasi (code.claude.com/docs/en/headless) dan rekaman
 * run sungguhan di test/__fixtures__/stream-success.ndjson:
 * - `{type:"system", subtype:"init", session_id, model, cwd, ...}` → pesan pertama
 * - `{type:"stream_event", event:{type:"content_block_delta", delta:{type:"text_delta", text}}}`
 *   → hanya muncul dengan --include-partial-messages
 * - `{type:"assistant", message:{content:[{type:"text"|"thinking"|"tool_use", ...}]}, parent_tool_use_id}`
 * - `{type:"user", message:{content:[{type:"tool_result", tool_use_id, content, is_error?}]}}`
 * - `{type:"result", subtype, is_error, duration_ms, num_turns, usage:{input_tokens, output_tokens,
 *   cache_read_input_tokens, cache_creation_input_tokens}, session_id}` → pesan terakhir
 * `--output-format stream-json` bersama `-p` memang mewajibkan `--verbose`.
 *
 * Tool event dari stream (tool_use/tool_result) juga diterjemahkan sebagai cadangan bila hook
 * tidak jalan; AgentProcessManager membuang duplikat berdasarkan toolUseId.
 */
import {
  MESSAGE_TEXT_MAX,
  TOOL_SUMMARY_MAX,
  summarizeToolInput,
  summarizeToolResponse,
  truncate,
  type AgentEvent,
  type TokenUsage,
} from '@aethera/shared';
import { makeEvent, type EventContext } from './context';

export interface StreamResult {
  isError: boolean;
  subtype: string;
  durationMs: number;
  numTurns: number;
  usage: TokenUsage;
  resultText: string;
  sessionId: string | null;
}

export interface StreamParserState {
  sessionId: string | null;
  model: string | null;
  /** tool_use yang sudah terlihat: id → nama & waktu mulai (ms). */
  tools: Map<string, { name: string; startedAt: number }>;
  result: StreamResult | null;
}

export function createStreamParserState(): StreamParserState {
  return { sessionId: null, model: null, tools: new Map(), result: null };
}

type Json = Record<string, unknown>;

function isRecord(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
}

function readUsage(u: unknown): TokenUsage {
  const o = isRecord(u) ? u : {};
  return {
    inputTokens: num(o.input_tokens),
    outputTokens: num(o.output_tokens),
    cacheReadTokens: num(o.cache_read_input_tokens),
    cacheCreationTokens: num(o.cache_creation_input_tokens),
  };
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (isRecord(c) && typeof c.text === 'string' ? c.text : ''))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

/**
 * Terjemahkan satu baris stdout. Baris kosong, bukan JSON, atau tipe yang tidak dikenal
 * menghasilkan array kosong — tidak pernah melempar error.
 */
export function parseStreamLine(
  line: string,
  ctx: EventContext,
  state: StreamParserState,
): AgentEvent[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  let msg: unknown;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!isRecord(msg)) return [];
  // Pesan dari subagent membawa parent_tool_use_id; teksnya tidak ditampilkan sebagai ucapan agent.
  const fromSubagent = typeof msg.parent_tool_use_id === 'string';

  switch (msg.type) {
    case 'system': {
      if (msg.subtype !== 'init') return [];
      const sessionId = typeof msg.session_id === 'string' ? msg.session_id : '';
      const model = typeof msg.model === 'string' ? msg.model : '';
      state.sessionId = sessionId || state.sessionId;
      state.model = model || state.model;
      return [
        makeEvent(ctx, 'agent.session_start', {
          sessionId: sessionId || 'tidak-diketahui',
          model,
          cwd: typeof msg.cwd === 'string' ? msg.cwd : ctx.cwd,
        }),
      ];
    }

    case 'stream_event': {
      if (fromSubagent || !isRecord(msg.event)) return [];
      const ev = msg.event;
      if (ev.type !== 'content_block_delta' || !isRecord(ev.delta)) return [];
      if (ev.delta.type !== 'text_delta' || typeof ev.delta.text !== 'string') return [];
      if (!ev.delta.text) return [];
      // Delta mentah; AgentProcessManager menggabung & men-throttle sebelum dipancarkan.
      return [
        makeEvent(ctx, 'agent.message', {
          text: truncate(ev.delta.text, MESSAGE_TEXT_MAX),
          partial: true,
        }),
      ];
    }

    case 'assistant': {
      if (!isRecord(msg.message) || !Array.isArray(msg.message.content)) return [];
      const out: AgentEvent[] = [];
      for (const block of msg.message.content) {
        if (!isRecord(block)) continue;
        if (block.type === 'text' && typeof block.text === 'string' && !fromSubagent) {
          const text = block.text.trim();
          if (text) {
            out.push(
              makeEvent(ctx, 'agent.message', {
                text: truncate(text, MESSAGE_TEXT_MAX),
                partial: false,
              }),
            );
          }
        } else if (block.type === 'tool_use' && typeof block.id === 'string') {
          const name = typeof block.name === 'string' ? block.name : 'tool';
          state.tools.set(block.id, { name, startedAt: ctx.now().getTime() });
          out.push(
            makeEvent(ctx, 'agent.tool_pre', {
              toolUseId: block.id,
              toolName: name,
              inputSummary: summarizeToolInput(name, block.input, ctx.cwd, TOOL_SUMMARY_MAX),
            }),
          );
        }
      }
      return out;
    }

    case 'user': {
      if (!isRecord(msg.message) || !Array.isArray(msg.message.content)) return [];
      const out: AgentEvent[] = [];
      for (const block of msg.message.content) {
        if (!isRecord(block) || block.type !== 'tool_result') continue;
        if (typeof block.tool_use_id !== 'string') continue;
        const known = state.tools.get(block.tool_use_id);
        state.tools.delete(block.tool_use_id);
        const detail = msg.tool_use_result ?? toolResultText(block.content);
        out.push(
          makeEvent(ctx, 'agent.tool_post', {
            toolUseId: block.tool_use_id,
            toolName: known?.name ?? 'tool',
            success: block.is_error !== true,
            durationMs: known ? Math.max(0, ctx.now().getTime() - known.startedAt) : null,
            resultSummary: summarizeToolResponse(detail, TOOL_SUMMARY_MAX),
          }),
        );
      }
      return out;
    }

    case 'result': {
      state.result = {
        isError: msg.is_error === true,
        subtype: typeof msg.subtype === 'string' ? msg.subtype : 'unknown',
        durationMs: num(msg.duration_ms),
        numTurns: num(msg.num_turns),
        usage: readUsage(msg.usage),
        resultText: typeof msg.result === 'string' ? msg.result : '',
        sessionId: typeof msg.session_id === 'string' ? msg.session_id : state.sessionId,
      };
      // session_end dipancarkan saat proses benar-benar keluar (butuh exit code asli).
      return [];
    }

    default:
      return [];
  }
}
