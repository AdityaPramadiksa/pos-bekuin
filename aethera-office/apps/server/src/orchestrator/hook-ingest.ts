import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AgentProcessManager } from './process-manager';

const MAX_BODY_BYTES = 256 * 1024;

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

/**
 * Server HTTP kecil untuk POST /hook-ingest (dipakai demo tanpa Fastify). Selalu bind ke
 * 127.0.0.1: hanya proses di mesin ini yang boleh mengirim, dan tetap wajib token.
 */
export function createHookIngestServer(manager: Pick<AgentProcessManager, 'handleHook'>): Server {
  return createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/hook-ingest') {
      res.writeHead(404).end();
      return;
    }
    const raw = await readBody(req);
    let body: unknown = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = null;
    }
    const token = req.headers['x-aethera-token'];
    const ok = manager.handleHook(body, Array.isArray(token) ? token[0] : token);
    res.writeHead(ok ? 204 : 202).end();
  });
}

export function listenLocal(server: Server, port = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });
  });
}
