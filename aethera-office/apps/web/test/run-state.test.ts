import type { AgentEvent, RunSummary } from '@aethera/shared';
import { describe, expect, it } from 'vitest';
import {
  MAX_EVENTS,
  applyEvent,
  applyEvents,
  applyRunUpdate,
  initRunState,
  sortAgentsForRoster,
  totalUsage,
} from '../src/store/run-state';

const run: RunSummary = {
  runId: 'r1',
  startedAt: '2026-09-27T05:00:00.000Z',
  endedAt: null,
  status: 'running',
  agents: [
    { id: 'zaki', name: 'Zaki', role: 'Dev', deskPosition: { x: 0, z: 0 }, color: '#22c55e' },
    { id: 'lulu', name: 'Lulu', role: 'QA', deskPosition: { x: 2, z: 0 }, color: '#ec4899' },
  ],
};

let n = 0;
function ev(agentId: string, rest: Pick<AgentEvent, 'type' | 'payload'>, runId = 'r1'): AgentEvent {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    runId,
    agentId,
    timestamp: new Date(Date.parse(run.startedAt) + n * 1000).toISOString(),
    ...rest,
  } as AgentEvent;
}

const usage = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 30, cacheCreationTokens: 4 };

describe('applyEvent', () => {
  it('menurunkan status, sesi, tool aktif, aktivitas, dan token dari event', () => {
    const s = applyEvents(
      initRunState(run, [
        {
          runId: 'r1',
          agentId: 'zaki',
          status: 'idle',
          task: 'perbaiki bug',
          sessionId: null,
          lastActivity: '',
          lastEventAt: null,
          usage,
        },
      ]),
      [
        ev('zaki', {
          type: 'agent.status_change',
          payload: { from: 'idle', to: 'working', reason: 'mulai' },
        }),
        ev('zaki', {
          type: 'agent.session_start',
          payload: { sessionId: 's-1', model: 'm', cwd: '/w' },
        }),
        ev('zaki', {
          type: 'agent.tool_pre',
          payload: { toolUseId: 't', toolName: 'Edit', inputSummary: 'src/main.ts' },
        }),
      ],
    );
    const z = s.agents.zaki!;
    expect(z).toMatchObject({
      status: 'working',
      sessionId: 's-1',
      activeTool: 'Edit',
      lastActivity: 'Mengedit src/main.ts',
      task: 'perbaiki bug',
    });
    // Token dari snapshot tidak dipakai: token diturunkan dari session_end supaya tidak dobel.
    expect(z.usage.outputTokens).toBe(0);

    const s2 = applyEvents(s, [
      ev('zaki', {
        type: 'agent.tool_post',
        payload: {
          toolUseId: 't',
          toolName: 'Edit',
          success: true,
          durationMs: 5,
          resultSummary: '',
        },
      }),
      ev('zaki', {
        type: 'agent.session_end',
        payload: { exitCode: 0, durationMs: 1, numTurns: 1, usage },
      }),
      ev('zaki', {
        type: 'agent.status_change',
        payload: { from: 'working', to: 'done', reason: 'selesai' },
      }),
    ]);
    expect(s2.agents.zaki).toMatchObject({ status: 'done', activeTool: null, usage });
    expect(s2.agents.lulu).toBe(s.agents.lulu); // agent lain tidak berubah identitas
  });

  it('event duplikat (hydrate + socket) hanya diterapkan sekali', () => {
    const end = ev('zaki', {
      type: 'agent.session_end',
      payload: { exitCode: 0, durationMs: 1, numTurns: 1, usage },
    });
    const s1 = applyEvent(initRunState(run), end);
    const s2 = applyEvents(s1, [end, end]);
    expect(s2).toBe(s1);
    expect(s2.agents.zaki!.usage).toEqual(usage);
    expect(s2.events).toHaveLength(1);
  });

  it('event run lain atau agent tak dikenal tidak merusak state', () => {
    const s0 = initRunState(run);
    expect(
      applyEvent(s0, ev('zaki', { type: 'agent.error', payload: { message: 'x' } }, 'r2')),
    ).toBe(s0);
    const s1 = applyEvent(s0, ev('hantu', { type: 'agent.error', payload: { message: 'x' } }));
    expect(s1.agents).toBe(s0.agents);
    expect(s1.events).toHaveLength(1);
  });

  it('pesan parsial mengisi typing tapi tidak masuk stream; pesan utuh mengosongkan typing', () => {
    let s = applyEvent(
      initRunState(run),
      ev('lulu', { type: 'agent.message', payload: { text: 'Sedang me', partial: true } }),
    );
    expect(s.agents.lulu!.typing).toBe('Sedang me');
    expect(s.events).toHaveLength(0);
    s = applyEvent(
      s,
      ev('lulu', {
        type: 'agent.message',
        payload: { text: 'Sedang menulis tes.', partial: false },
      }),
    );
    expect(s.agents.lulu).toMatchObject({ typing: '', lastActivity: 'Sedang menulis tes.' });
    expect(s.events).toHaveLength(1);
  });

  it(`stream dibatasi ${MAX_EVENTS} event terakhir, recent per agent 10`, () => {
    const many = Array.from({ length: MAX_EVENTS + 5 }, (_, i) =>
      ev('zaki', { type: 'agent.message', payload: { text: `m${i}`, partial: false } }),
    );
    const s = applyEvents(initRunState(run), many);
    expect(s.events).toHaveLength(MAX_EVENTS);
    expect(s.events[0]!.id).toBe(many[5]!.id);
    expect(s.agents.zaki!.recent).toHaveLength(10);
    expect(s.seen.size).toBe(MAX_EVENTS + 5);
  });
});

describe('helper', () => {
  it('roster: error & blocked di atas, done di bawah', () => {
    let s = initRunState({
      ...run,
      agents: [...run.agents, { ...run.agents[0]!, id: 'mila', name: 'Mila' }],
    });
    s = applyEvents(s, [
      ev('zaki', {
        type: 'agent.status_change',
        payload: { from: 'idle', to: 'done', reason: '' },
      }),
      ev('lulu', {
        type: 'agent.status_change',
        payload: { from: 'idle', to: 'working', reason: '' },
      }),
      ev('mila', {
        type: 'agent.status_change',
        payload: { from: 'idle', to: 'blocked', reason: '' },
      }),
    ]);
    expect(sortAgentsForRoster(Object.values(s.agents)).map((a) => a.def.id)).toEqual([
      'mila',
      'lulu',
      'zaki',
    ]);
  });

  it('totalUsage & applyRunUpdate', () => {
    let s = applyEvents(initRunState(run), [
      ev('zaki', {
        type: 'agent.session_end',
        payload: { exitCode: 0, durationMs: 1, numTurns: 1, usage },
      }),
      ev('lulu', {
        type: 'agent.session_end',
        payload: { exitCode: 0, durationMs: 1, numTurns: 1, usage },
      }),
    ]);
    expect(totalUsage(s.agents)).toEqual({
      inputTokens: 2,
      outputTokens: 4,
      cacheReadTokens: 60,
      cacheCreationTokens: 8,
    });
    s = applyRunUpdate(s, { ...run, status: 'completed', endedAt: '2026-09-27T06:00:00.000Z' });
    expect(s.run).toMatchObject({ status: 'completed', endedAt: '2026-09-27T06:00:00.000Z' });
    expect(applyRunUpdate(s, { ...run, runId: 'lain' })).toBe(s);
  });
});
