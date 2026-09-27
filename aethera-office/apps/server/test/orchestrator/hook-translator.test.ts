import { agentEventSchema } from '@aethera/shared';
import { describe, expect, it } from 'vitest';
import { buildRelayBody } from '../../../../packages/hook-relay/src/body';
import {
  createHookState,
  translateHook,
  type RelayedHook,
} from '../../src/orchestrator/hook-translator';
import { fixtureLines, testContext } from '../helpers';

const relayed = fixtureLines('hooks-success.ndjson').map(
  (l) => buildRelayBody(JSON.parse(l) as Record<string, unknown>, {}) as unknown as RelayedHook,
);

describe('translateHook dengan rekaman hook sungguhan', () => {
  const { ctx } = testContext();
  const state = createHookState();
  const results = relayed.map((h) => translateHook(h, ctx, state));

  it('SessionStart dan Stop diabaikan', () => {
    expect(results[0]).toEqual({ kind: 'ignored' });
    expect(results.at(-1)).toEqual({ kind: 'ignored' });
  });

  it('Pre/PostToolUse → tool_pre/tool_post valid dan berpasangan', () => {
    const events = results.flatMap((r) => (r.kind === 'events' ? r.events : []));
    expect(events.map((e) => e.type)).toEqual([
      'agent.tool_pre',
      'agent.tool_post',
      'agent.tool_pre',
      'agent.tool_post',
    ]);
    for (const e of events) expect(agentEventSchema.safeParse(e).success).toBe(true);
    expect(events[0]).toMatchObject({ payload: { toolName: 'Write', inputSummary: 'hello.txt' } });
    expect(events[3]).toMatchObject({
      payload: { toolName: 'Bash', success: true, durationMs: 333, resultSummary: 'hello.txt' },
    });
    expect(state.toolStarts.size).toBe(0);
  });
});

describe('translateHook kasus lain', () => {
  it('PostToolUseFailure → success=false dengan pesan error, durasi dari tool_pre', () => {
    const { ctx, advance } = testContext();
    const state = createHookState();
    translateHook(
      {
        session_id: 's',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_use_id: 't1',
        tool_input_summary: 'npm test',
      },
      ctx,
      state,
    );
    advance(1500);
    const r = translateHook(
      {
        session_id: 's',
        hook_event_name: 'PostToolUseFailure',
        tool_name: 'Bash',
        tool_use_id: 't1',
        tool_error: 'exit 1',
      },
      ctx,
      state,
    );
    expect(r).toMatchObject({
      kind: 'events',
      events: [{ payload: { success: false, durationMs: 1500, resultSummary: 'exit 1' } }],
    });
  });

  it('Notification permission_prompt → blocked; jenis lain diabaikan', () => {
    const { ctx } = testContext();
    expect(
      translateHook(
        {
          session_id: 's',
          hook_event_name: 'Notification',
          notification_type: 'permission_prompt',
          message: 'Claude butuh izin Bash',
        },
        ctx,
        createHookState(),
      ),
    ).toEqual({ kind: 'blocked', reason: 'Claude butuh izin Bash' });
    expect(
      translateHook(
        { session_id: 's', hook_event_name: 'Notification', notification_type: 'idle_prompt' },
        ctx,
        createHookState(),
      ),
    ).toEqual({ kind: 'ignored' });
  });

  it('tool hook tanpa tool_use_id diabaikan', () => {
    const { ctx } = testContext();
    expect(
      translateHook(
        { session_id: 's', hook_event_name: 'PreToolUse', tool_name: 'Bash' },
        ctx,
        createHookState(),
      ),
    ).toEqual({ kind: 'ignored' });
  });
});
