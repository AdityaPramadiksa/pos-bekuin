import { createRequire } from 'node:module';

/** Event hook yang dipasang ke tiap proses agent. */
export const HOOK_EVENTS = [
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'Stop',
] as const;

/** Batas waktu hook dalam DETIK (satuan resmi setting hooks). Relay sendiri berhenti ≤ 2 detik. */
const HOOK_TIMEOUT_S = 5;

/** Lokasi dist/relay.js dari paket @aethera/hook-relay (bisa ditimpa AETHERA_RELAY_PATH). */
export function resolveRelayPath(): string {
  if (process.env.AETHERA_RELAY_PATH) return process.env.AETHERA_RELAY_PATH;
  return createRequire(import.meta.url).resolve('@aethera/hook-relay');
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Susun JSON settings untuk flag `--settings`. Hook disuntik per proses sehingga tidak ada
 * `.claude/settings.json` yang ditulis ke folder kerja agent.
 */
export function buildHookSettings(relayPath: string, nodePath = process.execPath): string {
  const command = `${shellQuote(nodePath)} ${shellQuote(relayPath)}`;
  const entry = [{ hooks: [{ type: 'command', command, timeout: HOOK_TIMEOUT_S }] }];
  const hooks: Record<string, typeof entry> = {};
  for (const ev of HOOK_EVENTS) hooks[ev] = entry;
  return JSON.stringify({ hooks });
}
