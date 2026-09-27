import type { ManagerInstruction } from '@aethera/shared';
import { describe, expect, it } from 'vitest';
import { upsertInstruction } from '../src/store/store';

const base: ManagerInstruction = {
  id: 'a',
  runId: 'r',
  agentId: 'zaki',
  text: 'x',
  status: 'queued',
  mode: null,
  createdAt: '2026-09-27T05:00:00.000Z',
  sentAt: null,
  error: null,
};

describe('upsertInstruction', () => {
  it('mengganti item dengan id sama tanpa mengubah urutan', () => {
    const list = [base, { ...base, id: 'b', createdAt: '2026-09-27T05:01:00.000Z' }];
    const next = upsertInstruction(list, { ...base, status: 'sent', mode: 'resume' });
    expect(next.map((i) => [i.id, i.status])).toEqual([
      ['a', 'sent'],
      ['b', 'queued'],
    ]);
  });

  it('menyisipkan item baru sesuai waktu dibuat', () => {
    const list = [{ ...base, id: 'b', createdAt: '2026-09-27T05:02:00.000Z' }];
    expect(upsertInstruction(list, base).map((i) => i.id)).toEqual(['a', 'b']);
  });
});
