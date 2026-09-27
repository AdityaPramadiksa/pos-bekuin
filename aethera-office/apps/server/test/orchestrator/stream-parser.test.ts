import { agentEventSchema, type AgentEvent } from '@aethera/shared';
import { describe, expect, it } from 'vitest';
import { createStreamParserState, parseStreamLine } from '../../src/orchestrator/stream-parser';
import { fixtureLines, testContext } from '../helpers';

function parseAll(lines: string[]) {
  const { ctx, advance } = testContext();
  const state = createStreamParserState();
  const events: AgentEvent[] = [];
  for (const l of lines) {
    advance(10);
    events.push(...parseStreamLine(l, ctx, state));
  }
  return { events, state };
}

describe('parseStreamLine dengan rekaman run sungguhan', () => {
  const { events, state } = parseAll(fixtureLines('stream-success.ndjson'));

  it('semua event lolos skema Zod', () => {
    for (const e of events) expect(agentEventSchema.safeParse(e).success).toBe(true);
  });

  it('system/init → session_start dengan session id dan model', () => {
    expect(events[0]).toMatchObject({
      type: 'agent.session_start',
      payload: {
        sessionId: '1e613ffb-f654-4388-9a24-61b45fed2206',
        model: 'claude-haiku-4-5-20251001',
      },
    });
    expect(state.sessionId).toBe('1e613ffb-f654-4388-9a24-61b45fed2206');
  });

  it('tool_use/tool_result → tool_pre/tool_post berpasangan (Write, Bash)', () => {
    const pre = events.filter((e) => e.type === 'agent.tool_pre');
    const post = events.filter((e) => e.type === 'agent.tool_post');
    expect(pre.map((e) => [e.payload.toolName, e.payload.inputSummary])).toEqual([
      ['Write', 'hello.txt'],
      ['Bash', 'ls'],
    ]);
    expect(post.map((e) => e.payload.toolUseId)).toEqual(pre.map((e) => e.payload.toolUseId));
    expect(post.every((e) => e.type === 'agent.tool_post' && e.payload.success)).toBe(true);
    expect(post[1]).toMatchObject({ payload: { toolName: 'Bash', resultSummary: 'hello.txt' } });
    expect(post[0]!.type === 'agent.tool_post' && post[0]!.payload.durationMs).toBeGreaterThan(0);
  });

  it('teks: delta parsial + satu pesan utuh', () => {
    const msgs = events.filter((e) => e.type === 'agent.message');
    const full = msgs.filter((e) => e.type === 'agent.message' && !e.payload.partial);
    expect(full).toHaveLength(1);
    expect(full[0]!.type === 'agent.message' && full[0]!.payload.text).toContain('hello.txt');
    const partialText = msgs
      .filter((e) => e.type === 'agent.message' && e.payload.partial)
      .map((e) => (e.type === 'agent.message' ? e.payload.text : ''))
      .join('');
    expect(partialText.trim()).toBe(full[0]!.type === 'agent.message' ? full[0]!.payload.text : '');
  });

  it('result disimpan di state (tidak langsung jadi event)', () => {
    expect(events.some((e) => e.type === 'agent.session_end')).toBe(false);
    expect(state.result).toEqual({
      isError: false,
      subtype: 'success',
      durationMs: 7148,
      numTurns: 3,
      usage: {
        inputTokens: 26,
        outputTokens: 462,
        cacheReadTokens: 81674,
        cacheCreationTokens: 5796,
      },
      resultText: expect.stringContaining('hello.txt'),
      sessionId: '1e613ffb-f654-4388-9a24-61b45fed2206',
    });
  });
});

describe('parseStreamLine tahan input aneh', () => {
  it.each([
    '',
    '   ',
    'bukan json',
    '[]',
    '42',
    'null',
    '{"type":"tak_dikenal"}',
    '{"type":"assistant"}',
  ])('mengabaikan %j', (line) => {
    const { ctx } = testContext();
    expect(parseStreamLine(line, ctx, createStreamParserState())).toEqual([]);
  });

  it('result error dengan field hilang tetap aman', () => {
    const { ctx } = testContext();
    const state = createStreamParserState();
    parseStreamLine(
      '{"type":"result","subtype":"error_during_execution","is_error":true}',
      ctx,
      state,
    );
    expect(state.result).toMatchObject({ isError: true, durationMs: 0, numTurns: 0 });
  });

  it('teks dari subagent tidak dianggap ucapan agent', () => {
    const { ctx } = testContext();
    const line = JSON.stringify({
      type: 'assistant',
      parent_tool_use_id: 'toolu_x',
      message: { content: [{ type: 'text', text: 'dari subagent' }] },
    });
    expect(parseStreamLine(line, ctx, createStreamParserState())).toEqual([]);
  });

  it('tool_result dengan is_error → success=false, tool tak dikenal → durasi null', () => {
    const { ctx } = testContext();
    const line = JSON.stringify({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't9',
            content: [{ type: 'text', text: 'Izin ditolak' }],
            is_error: true,
          },
        ],
      },
    });
    expect(parseStreamLine(line, ctx, createStreamParserState())).toMatchObject([
      {
        type: 'agent.tool_post',
        payload: {
          toolUseId: 't9',
          success: false,
          durationMs: null,
          resultSummary: 'Izin ditolak',
        },
      },
    ]);
  });
});
