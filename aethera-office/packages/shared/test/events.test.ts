import { describe, expect, it } from 'vitest';
import {
  AGENT_EVENT_TYPES,
  agentDefinitionSchema,
  agentEventSchema,
  runSummarySchema,
  type AgentEvent,
} from '../src';

const base = {
  id: '8f14e45f-ceea-4e7a-9b1c-1a2b3c4d5e6f',
  runId: 'run-1',
  agentId: 'zaki',
  timestamp: '2026-09-27T05:42:59.000Z',
};

const valid: Record<AgentEvent['type'], unknown> = {
  'agent.session_start': {
    ...base,
    type: 'agent.session_start',
    payload: { sessionId: 's-1', model: 'claude-haiku-4-5', cwd: '/tmp/ws' },
  },
  'agent.tool_pre': {
    ...base,
    type: 'agent.tool_pre',
    payload: { toolUseId: 'toolu_1', toolName: 'Edit', inputSummary: 'src/main.ts' },
  },
  'agent.tool_post': {
    ...base,
    type: 'agent.tool_post',
    payload: {
      toolUseId: 'toolu_1',
      toolName: 'Edit',
      success: true,
      durationMs: null,
      resultSummary: 'update: src/main.ts',
    },
  },
  'agent.message': { ...base, type: 'agent.message', payload: { text: 'Halo', partial: false } },
  'agent.status_change': {
    ...base,
    type: 'agent.status_change',
    payload: { from: 'idle', to: 'working', reason: 'proses dimulai' },
  },
  'agent.session_end': {
    ...base,
    type: 'agent.session_end',
    payload: {
      exitCode: 0,
      durationMs: 5000,
      numTurns: 3,
      usage: {
        inputTokens: 26,
        outputTokens: 462,
        cacheReadTokens: 81674,
        cacheCreationTokens: 5796,
      },
    },
  },
  'agent.error': { ...base, type: 'agent.error', payload: { message: 'proses crash' } },
};

describe('agentEventSchema', () => {
  it.each(AGENT_EVENT_TYPES)('menerima contoh valid %s', (type) => {
    const parsed = agentEventSchema.safeParse(valid[type]);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('mencakup ketujuh tipe event', () => {
    expect(new Set(AGENT_EVENT_TYPES)).toEqual(new Set(Object.keys(valid)));
  });

  it('menolak tipe yang tidak dikenal', () => {
    expect(agentEventSchema.safeParse({ ...base, type: 'agent.dance', payload: {} }).success).toBe(
      false,
    );
  });

  it('menolak field payload yang hilang', () => {
    const e = valid['agent.tool_pre'] as { payload: Record<string, unknown> };
    const { toolUseId: _drop, ...rest } = e.payload;
    expect(agentEventSchema.safeParse({ ...e, payload: rest }).success).toBe(false);
  });

  it('menolak field dasar yang hilang', () => {
    const { runId: _drop, ...rest } = valid['agent.message'] as Record<string, unknown>;
    expect(agentEventSchema.safeParse(rest).success).toBe(false);
  });

  it('menolak status di luar enum', () => {
    const e = valid['agent.status_change'] as { payload: Record<string, unknown> };
    expect(
      agentEventSchema.safeParse({ ...e, payload: { ...e.payload, to: 'sleeping' } }).success,
    ).toBe(false);
  });

  it('menolak token negatif dan pecahan', () => {
    const e = valid['agent.session_end'] as { payload: { usage: Record<string, number> } };
    for (const bad of [-1, 1.5]) {
      const payload = { ...e.payload, usage: { ...e.payload.usage, outputTokens: bad } };
      expect(agentEventSchema.safeParse({ ...e, payload }).success).toBe(false);
    }
  });

  it('menolak teks pesan melebihi 1000 karakter dan id bukan uuid', () => {
    const e = valid['agent.message'] as Record<string, unknown>;
    expect(
      agentEventSchema.safeParse({ ...e, payload: { text: 'x'.repeat(1001), partial: false } })
        .success,
    ).toBe(false);
    expect(agentEventSchema.safeParse({ ...e, id: 'bukan-uuid' }).success).toBe(false);
  });
});

describe('agentDefinitionSchema & runSummarySchema', () => {
  const agent = {
    id: 'zaki',
    name: 'Zaki',
    role: 'Developer',
    deskPosition: { x: 1, z: 2 },
    color: '#7c3aed',
  };

  it('menerima definisi valid', () => {
    expect(agentDefinitionSchema.parse(agent)).toEqual(agent);
  });

  it('menolak posisi pecahan, warna non-hex, dan id bukan slug', () => {
    expect(
      agentDefinitionSchema.safeParse({ ...agent, deskPosition: { x: 1.5, z: 0 } }).success,
    ).toBe(false);
    expect(agentDefinitionSchema.safeParse({ ...agent, color: 'ungu' }).success).toBe(false);
    expect(agentDefinitionSchema.safeParse({ ...agent, id: 'Zaki Dev' }).success).toBe(false);
  });

  it('run summary dengan endedAt null', () => {
    const run = {
      runId: 'r',
      startedAt: base.timestamp,
      endedAt: null,
      agents: [agent],
      status: 'running',
    };
    expect(runSummarySchema.safeParse(run).success).toBe(true);
    expect(runSummarySchema.safeParse({ ...run, status: 'paused' }).success).toBe(false);
  });
});
