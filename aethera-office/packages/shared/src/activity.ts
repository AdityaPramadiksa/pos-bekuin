import type { AgentEvent } from './events';

const VERB_BY_TOOL: Record<string, string> = {
  Bash: 'Menjalankan',
  Read: 'Membaca',
  Write: 'Menulis',
  Edit: 'Mengedit',
  MultiEdit: 'Mengedit',
  NotebookEdit: 'Mengedit notebook',
  Glob: 'Mencari file',
  Grep: 'Mencari teks',
  WebFetch: 'Membuka',
  WebSearch: 'Mencari di web',
  Task: 'Mendelegasikan',
  Agent: 'Mendelegasikan',
  TodoWrite: 'Memperbarui todo',
};

const STATUS_LABEL = {
  idle: 'Menunggu',
  working: 'Bekerja',
  blocked: 'Tertahan',
  error: 'Error',
  done: 'Selesai',
} as const;

export function statusLabel(status: keyof typeof STATUS_LABEL): string {
  return STATUS_LABEL[status];
}

/** Buang penanda markdown umum (**tebal**, `kode`, # judul) supaya enak dibaca di label. */
export function plainText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Kalimat aktivitas singkat berbahasa manusia, mis. "Mengedit src/main.ts". */
export function describeEvent(event: AgentEvent): string {
  switch (event.type) {
    case 'agent.session_start':
      return `Mulai sesi (${event.payload.model || 'model default'})`;
    case 'agent.tool_pre': {
      const verb = VERB_BY_TOOL[event.payload.toolName] ?? `Memakai ${event.payload.toolName}`;
      return event.payload.inputSummary ? `${verb} ${event.payload.inputSummary}` : verb;
    }
    case 'agent.tool_post':
      return `${event.payload.toolName} ${event.payload.success ? 'selesai' : 'gagal'}${
        event.payload.durationMs !== null ? ` (${event.payload.durationMs} ms)` : ''
      }`;
    case 'agent.message':
      return plainText(event.payload.text);
    case 'agent.status_change':
      return `${STATUS_LABEL[event.payload.to]}${event.payload.reason ? ` — ${event.payload.reason}` : ''}`;
    case 'agent.session_end':
      return `Sesi berakhir (exit ${event.payload.exitCode}, ${event.payload.numTurns} giliran)`;
    case 'agent.error':
      return `Error: ${event.payload.message}`;
  }
}

/** Event yang mengubah "aktivitas terakhir" agent di UI. */
export function isActivityEvent(event: AgentEvent): boolean {
  return (
    event.type === 'agent.tool_pre' ||
    (event.type === 'agent.message' && event.payload.text.trim().length > 0) ||
    event.type === 'agent.error'
  );
}
