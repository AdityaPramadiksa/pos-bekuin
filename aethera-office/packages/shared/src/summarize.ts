/** Potong teks ke `max` karakter; tambahkan elipsis bila terpotong. */
export function truncate(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max === 1) return '…';
  return `${text.slice(0, max - 1)}…`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Jadikan path relatif terhadap cwd agent supaya ringkas di UI. */
export function relativePath(path: string, cwd?: string): string {
  if (!cwd) return path;
  const base = cwd.endsWith('/') ? cwd : `${cwd}/`;
  return path.startsWith(base) ? path.slice(base.length) : path;
}

function safeJson(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s ?? String(v);
  } catch {
    return '[tidak bisa diserialisasi]';
  }
}

/**
 * Ringkas input tool jadi satu baris. Harus tahan input bentuk apa pun karena datang
 * mentah dari hook Claude Code.
 */
export function summarizeToolInput(
  toolName: string,
  input: unknown,
  cwd?: string,
  max = 500,
): string {
  if (!isRecord(input)) {
    return input === undefined || input === null ? '' : truncate(safeJson(input), max);
  }
  const path = str(input.file_path) ?? str(input.notebook_path) ?? str(input.path);
  let out: string | undefined;
  switch (toolName) {
    case 'Bash':
      out = str(input.command);
      break;
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      out = path ? relativePath(path, cwd) : undefined;
      break;
    case 'Glob':
    case 'Grep':
      out = str(input.pattern);
      if (out && path) out = `${out} di ${relativePath(path, cwd)}`;
      break;
    case 'WebFetch':
      out = str(input.url);
      break;
    case 'WebSearch':
      out = str(input.query);
      break;
    case 'Task':
    case 'Agent':
      out = str(input.description) ?? str(input.prompt);
      break;
    default:
      out = path ? relativePath(path, cwd) : undefined;
  }
  return truncate((out ?? safeJson(input)).replace(/\s+/g, ' ').trim(), max);
}

/** Ringkas respons tool dari hook PostToolUse (bentuknya berbeda per tool). */
export function summarizeToolResponse(response: unknown, max = 500): string {
  if (response === undefined || response === null) return '';
  if (typeof response === 'string') return truncate(response.replace(/\s+/g, ' ').trim(), max);
  if (isRecord(response)) {
    const stdout = str(response.stdout);
    const stderr = str(response.stderr);
    if (stdout !== undefined || stderr !== undefined) {
      return truncate([stdout, stderr].filter(Boolean).join(' | ').replace(/\s+/g, ' '), max);
    }
    const filePath = str(response.filePath);
    const type = str(response.type);
    if (filePath) return truncate(type ? `${type}: ${filePath}` : filePath, max);
  }
  return truncate(safeJson(response), max);
}
