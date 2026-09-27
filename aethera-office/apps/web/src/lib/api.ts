import type { AgentState, RunDetailResponse, RunSummary, StartRunRequest } from '@aethera/shared';

/** Base URL API. Default "/api" (di-proxy Vite ke server di port 4400). */
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    });
  } catch {
    throw new ApiError('Server tidak bisa dihubungi. Pastikan `pnpm dev` berjalan.', 0);
  }
  if (!res.ok) {
    let message = `Permintaan gagal (${res.status})`;
    try {
      const body = (await res.json()) as {
        message?: string;
        issues?: { path: string; message: string }[];
      };
      if (body.issues?.length) {
        message = body.issues
          .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
          .join('; ');
      } else if (body.message) message = body.message;
    } catch {
      /* body bukan JSON */
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  listRuns: (limit = 20) => request<RunSummary[]>(`/runs?limit=${limit}`),
  getRun: (runId: string, after = 0, limit = 500) =>
    request<RunDetailResponse>(`/runs/${encodeURIComponent(runId)}?after=${after}&limit=${limit}`),
  getAgents: (runId: string) => request<AgentState[]>(`/runs/${encodeURIComponent(runId)}/agents`),
  startRun: (body: StartRunRequest) =>
    request<RunSummary>('/runs', { method: 'POST', body: JSON.stringify(body) }),
  stopAgent: (runId: string, agentId: string) =>
    request<{ message: string }>(
      `/runs/${encodeURIComponent(runId)}/agents/${encodeURIComponent(agentId)}/stop`,
      { method: 'POST' },
    ),
};
