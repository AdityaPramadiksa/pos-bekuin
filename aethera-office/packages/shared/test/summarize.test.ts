import { describe, expect, it } from 'vitest';
import {
  describeEvent,
  plainText,
  summarizeToolInput,
  summarizeToolResponse,
  truncate,
} from '../src';

describe('truncate', () => {
  it('tidak mengubah teks pendek', () => expect(truncate('halo', 10)).toBe('halo'));
  it('memotong dengan elipsis tepat di batas', () => {
    const out = truncate('abcdefghij', 5);
    expect(out).toBe('abcd…');
    expect(out.length).toBe(5);
  });
  it('batas 0 dan 1', () => {
    expect(truncate('abc', 0)).toBe('');
    expect(truncate('abc', 1)).toBe('…');
  });
});

describe('summarizeToolInput', () => {
  const cwd = '/home/u/ws';

  it('Edit/Write/Read → path relatif', () => {
    expect(
      summarizeToolInput('Edit', { file_path: '/home/u/ws/src/main.ts', old_string: 'a' }, cwd),
    ).toBe('src/main.ts');
    expect(summarizeToolInput('Write', { file_path: '/etc/hosts', content: 'x' }, cwd)).toBe(
      '/etc/hosts',
    );
    expect(summarizeToolInput('Read', { file_path: '/home/u/ws/README.md' }, cwd + '/')).toBe(
      'README.md',
    );
  });

  it('Bash → command, whitespace dirapikan', () => {
    expect(
      summarizeToolInput('Bash', { command: 'npm   test\n --watch=false', description: 'x' }),
    ).toBe('npm test --watch=false');
  });

  it('Bash → path folder kerja di dalam perintah dijadikan relatif', () => {
    expect(
      summarizeToolInput('Bash', { command: 'ls /home/u/ws/ && cat /home/u/ws/a.txt' }, cwd),
    ).toBe('ls . && cat a.txt');
  });

  it('Grep → pola + lokasi', () => {
    expect(summarizeToolInput('Grep', { pattern: 'TODO', path: '/home/u/ws/src' }, cwd)).toBe(
      'TODO di src',
    );
  });

  it('tool tak dikenal → JSON terpotong', () => {
    const out = summarizeToolInput('mcp__x__y', { a: 'b'.repeat(1000) }, cwd, 50);
    expect(out.length).toBe(50);
    expect(out.startsWith('{"a":"bbb')).toBe(true);
  });

  it('tahan input null, undefined, primitif, array, dan sirkular', () => {
    expect(summarizeToolInput('Edit', null)).toBe('');
    expect(summarizeToolInput('Edit', undefined)).toBe('');
    expect(summarizeToolInput('Bash', 42)).toBe('42');
    expect(summarizeToolInput('Bash', ['ls'])).toBe('["ls"]');
    expect(summarizeToolInput('Bash', { command: 123 })).toBe('{"command":123}');
    const circ: Record<string, unknown> = {};
    circ.self = circ;
    expect(summarizeToolInput('X', circ)).toBe('[tidak bisa diserialisasi]');
  });
});

describe('summarizeToolResponse', () => {
  it('Bash stdout/stderr', () => {
    expect(summarizeToolResponse({ stdout: 'hello.txt', stderr: '', interrupted: false })).toBe(
      'hello.txt',
    );
  });
  it('Write → type: path', () => {
    expect(summarizeToolResponse({ type: 'create', filePath: '/a/b.txt', content: 'x' })).toBe(
      'create: /a/b.txt',
    );
  });
  it('string dan null', () => {
    expect(summarizeToolResponse('ok\n')).toBe('ok');
    expect(summarizeToolResponse(null)).toBe('');
  });
});

describe('describeEvent', () => {
  const base = {
    id: '8f14e45f-ceea-4e7a-9b1c-1a2b3c4d5e6f',
    runId: 'r',
    agentId: 'a',
    timestamp: '2026-09-27T00:00:00.000Z',
  };
  it('tool_pre Edit → "Mengedit <path>"', () => {
    expect(
      describeEvent({
        ...base,
        type: 'agent.tool_pre',
        payload: { toolUseId: 't', toolName: 'Edit', inputSummary: 'src/main.ts' },
      }),
    ).toBe('Mengedit src/main.ts');
  });
  it('tool_pre tool tak dikenal', () => {
    expect(
      describeEvent({
        ...base,
        type: 'agent.tool_pre',
        payload: { toolUseId: 't', toolName: 'Foo', inputSummary: '' },
      }),
    ).toBe('Memakai Foo');
  });
});

describe('plainText', () => {
  it('membuang markdown tebal, kode, judul, dan blok kode', () => {
    expect(plainText('## Hasil\nFile **todo.js** sudah `dibuat`.\n```js\nx()\n```')).toBe(
      'Hasil File todo.js sudah dibuat.',
    );
  });
});
