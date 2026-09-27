import { resolve } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4400),
  HOST: z.string().default('127.0.0.1'),
  DB_PATH: z.string().default('./aethera.db'),
  AGENT_WORKSPACES_DIR: z.string().default('./workspaces'),
  CLAUDE_BIN: z.string().default('claude'),
  /** Model untuk semua agent, mis. "sonnet" / "haiku". Kosong = default akun. */
  AETHERA_MODEL: z.string().optional(),
  /** Aturan izin dipisah koma, mis. "Read,Glob,Grep,Bash(npm test *)". */
  AETHERA_ALLOWED_TOOLS: z.string().default('Read,Glob,Grep,Bash(ls *),Bash(cat *)'),
  AETHERA_PERMISSION_MODE: z
    .enum(['acceptEdits', 'auto', 'dontAsk', 'plan'])
    .default('acceptEdits'),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const e = envSchema.parse(env);
  return {
    port: e.PORT,
    host: e.HOST,
    dbPath: resolve(e.DB_PATH),
    workspacesDir: resolve(e.AGENT_WORKSPACES_DIR),
    claudeBin: e.CLAUDE_BIN,
    model: e.AETHERA_MODEL || undefined,
    allowedTools: e.AETHERA_ALLOWED_TOOLS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    permissionMode: e.AETHERA_PERMISSION_MODE,
  };
}
