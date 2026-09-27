import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { EventContext } from '../src/orchestrator/context';

export function fixtureLines(name: string): string[] {
  return readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0);
}

/** Konteks deterministik: jam bisa dimajukan manual, id berurutan berbentuk UUID. */
export function testContext(overrides: Partial<EventContext> = {}) {
  let t = Date.parse('2026-09-27T05:00:00.000Z');
  let n = 0;
  const ctx: EventContext = {
    runId: 'run-1',
    agentId: 'lulu',
    cwd: '/tmp/aethera-demo/ws',
    now: () => new Date(t),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    ...overrides,
  };
  return { ctx, advance: (ms: number) => (t += ms) };
}
