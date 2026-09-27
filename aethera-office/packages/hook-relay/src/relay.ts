/**
 * hook-relay: dipanggil Claude Code sebagai command hook (`node dist/relay.js`).
 *
 * Membaca payload JSON hook dari stdin, meringkas tool_input/tool_response (supaya isi file
 * besar tidak ikut terkirim), lalu POST ke orchestrator di AETHERA_HOOK_URL.
 *
 * Aturan keras: hook TIDAK BOLEH memblokir atau mengubah keputusan tool agent. Karena itu
 * skrip ini tidak pernah menulis ke stdout (stdout JSON bisa dibaca sebagai keputusan) dan
 * selalu keluar dengan kode 0; POST dibatasi 1 detik dan seluruh skrip maksimal 2 detik.
 */
import { buildRelayBody } from './body';

const POST_TIMEOUT_MS = 1000;
const HARD_EXIT_MS = 2000;

// Pengaman terakhir: apa pun yang terjadi, keluar dengan kode 0.
setTimeout(() => process.exit(0), HARD_EXIT_MS).unref();

function logError(msg: string): void {
  process.stderr.write(`[aethera hook-relay] ${msg}\n`);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  const url = process.env.AETHERA_HOOK_URL;
  if (!url) {
    logError('AETHERA_HOOK_URL tidak di-set, payload dilewati');
    return;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readStdin());
  } catch {
    logError('stdin bukan JSON valid');
    return;
  }
  if (typeof raw !== 'object' || raw === null) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-aethera-token': process.env.AETHERA_HOOK_TOKEN ?? '',
      },
      body: JSON.stringify(buildRelayBody(raw as Record<string, unknown>)),
      signal: controller.signal,
    });
    if (!res.ok) logError(`orchestrator membalas ${res.status}`);
  } catch (err) {
    logError(`gagal POST: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

main()
  .catch((err: unknown) => logError(String(err)))
  .finally(() => process.exit(0));
