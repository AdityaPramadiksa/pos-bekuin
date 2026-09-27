import { summarizeToolInput, summarizeToolResponse, truncate } from '@aethera/shared/summarize';

/**
 * Susun body POST ke orchestrator dari payload hook mentah. tool_input/tool_response diringkas
 * di sini supaya isi file besar (Write/Edit) tidak ikut terkirim.
 */
export function buildRelayBody(
  raw: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
  const toolName = typeof raw.tool_name === 'string' ? raw.tool_name : '';
  const cwd = typeof raw.cwd === 'string' ? raw.cwd : undefined;
  const body: Record<string, unknown> = {
    session_id: raw.session_id,
    hook_event_name: raw.hook_event_name,
    cwd,
    tool_name: raw.tool_name,
    tool_use_id: raw.tool_use_id,
    duration_ms: raw.duration_ms,
    notification_type: raw.notification_type,
    message: typeof raw.message === 'string' ? truncate(raw.message, 500) : undefined,
    tool_error: typeof raw.tool_error === 'string' ? truncate(raw.tool_error, 500) : undefined,
    // Cadangan pemetaan bila session_id tidak dikenal (mis. sesi hasil --resume).
    run_id: env.AETHERA_RUN_ID,
    agent_id: env.AETHERA_AGENT_ID,
  };
  if ('tool_input' in raw)
    body.tool_input_summary = summarizeToolInput(toolName, raw.tool_input, cwd);
  if ('tool_response' in raw) body.tool_response_summary = summarizeToolResponse(raw.tool_response);
  return body;
}
