import {
  SOCKET_EVENTS,
  type AgentEvent,
  type ManagerInstruction,
  type RoadmapItem,
  type RunSummary,
} from '@aethera/shared';
import { io, type Socket } from 'socket.io-client';
import { useDashboard } from '@/store/store';
import { api, ApiError } from './api';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL as string | undefined;
const PAGE_SIZE = 1000;

function runIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('run');
}

function setRunIdInUrl(runId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('run', runId);
  window.history.replaceState(null, '', url);
}

function message(err: unknown): string {
  return err instanceof ApiError || err instanceof Error ? err.message : String(err);
}

/**
 * Menghubungkan dashboard ke server: Socket.io untuk event realtime + REST untuk hydrate.
 * Event socket yang datang selama hydrate ditampung lalu digabung (dedup by id di reducer).
 */
class RunConnection {
  private socket: Socket | null = null;
  private runId: string | null = null;
  private lastCursor = 0;
  private hydrating = false;
  private buffer: AgentEvent[] = [];
  private hydrateToken = 0;
  private started = false;

  start(): () => void {
    if (this.started) return () => {};
    this.started = true;
    const store = useDashboard.getState;
    const socket = SOCKET_URL ? io(SOCKET_URL) : io();
    this.socket = socket;

    socket.on('connect', () => {
      store().setConnection('connected');
      if (this.runId) {
        socket.emit(SOCKET_EVENTS.join, { runId: this.runId });
        // Setelah putus: ambil event yang terlewat sejak kursor terakhir.
        if (store().phase === 'ready') void this.hydrate(this.runId, false);
      }
      void this.refreshRuns();
    });
    socket.on('disconnect', () => store().setConnection('reconnecting'));
    socket.io.on('reconnect_attempt', () => store().setConnection('reconnecting'));
    socket.on(SOCKET_EVENTS.agentEvent, (e: AgentEvent) => {
      if (e.runId !== this.runId) return;
      if (this.hydrating) this.buffer.push(e);
      else store().ingest([e]);
    });
    socket.on(SOCKET_EVENTS.runUpdated, (run: RunSummary) => store().runUpdated(run));
    socket.on(SOCKET_EVENTS.roadmapUpdated, (msg: { runId: string; items: RoadmapItem[] }) =>
      store().setRoadmap(msg.runId, msg.items),
    );
    socket.on(SOCKET_EVENTS.instructionUpdated, (i: ManagerInstruction) =>
      store().instructionUpdated(i),
    );

    void this.init();
    return () => {
      socket.close();
      this.socket = null;
      this.started = false;
    };
  }

  private async init(): Promise<void> {
    const store = useDashboard.getState;
    try {
      const runs = await api.listRuns();
      store().setRuns(runs);
      const target = runIdFromUrl() ?? runs[0]?.runId ?? null;
      if (!target) {
        store().setPhase('empty');
        return;
      }
      await this.selectRun(target);
    } catch (err) {
      store().setPhase('error', message(err));
    }
  }

  async refreshRuns(): Promise<void> {
    try {
      useDashboard.getState().setRuns(await api.listRuns());
    } catch {
      /* daftar run hanya pelengkap; error utama ditangani hydrate */
    }
  }

  async selectRun(runId: string): Promise<void> {
    if (this.runId && this.runId !== runId) {
      this.socket?.emit(SOCKET_EVENTS.leave, { runId: this.runId });
    }
    this.runId = runId;
    this.lastCursor = 0;
    setRunIdInUrl(runId);
    this.socket?.emit(SOCKET_EVENTS.join, { runId });
    await this.hydrate(runId, true);
  }

  /** Coba lagi setelah error memuat. */
  retry(): void {
    if (this.runId) void this.hydrate(this.runId, true);
    else void this.init();
  }

  private async hydrate(runId: string, full: boolean): Promise<void> {
    const store = useDashboard.getState;
    const token = ++this.hydrateToken;
    this.hydrating = true;
    this.buffer = [];
    if (full) store().setPhase('loading');
    try {
      const [states, roadmap, instructions] = await Promise.all([
        api.getAgents(runId),
        api.listRoadmap(runId),
        api.listInstructions(runId),
      ]);
      let cursor = full ? 0 : this.lastCursor;
      let first = true;
      for (;;) {
        const page = await api.getRun(runId, cursor, PAGE_SIZE);
        if (token !== this.hydrateToken) return;
        if (first) {
          if (full) store().resetRun(page.run, states);
          else store().runUpdated(page.run);
          first = false;
        }
        store().ingest(page.events);
        cursor = page.nextCursor;
        if (!page.hasMore) break;
      }
      this.lastCursor = cursor;
      store().setRoadmap(runId, roadmap);
      store().setInstructions(instructions);
      store().ingest(this.buffer);
      store().setPhase('ready');
    } catch (err) {
      if (token !== this.hydrateToken) return;
      if (full) store().setPhase('error', message(err));
    } finally {
      if (token === this.hydrateToken) {
        this.hydrating = false;
        this.buffer = [];
      }
    }
  }
}

export const connection = new RunConnection();
