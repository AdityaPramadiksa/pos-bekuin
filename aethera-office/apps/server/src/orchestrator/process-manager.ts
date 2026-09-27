import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';
import {
  ZERO_USAGE,
  truncate,
  type AgentDefinition,
  type AgentEvent,
  type AgentStatus,
} from '@aethera/shared';
import { defaultClock, makeEvent, type EventContext } from './context';
import { buildHookSettings } from './hook-settings';
import {
  createHookState,
  isRelayedHook,
  translateHook,
  type HookState,
  type RelayedHook,
} from './hook-translator';
import { MessageThrottle } from './message-throttle';
import { createStreamParserState, parseStreamLine, type StreamParserState } from './stream-parser';

export type PermissionMode = 'acceptEdits' | 'auto' | 'dontAsk' | 'plan' | 'bypassPermissions';

export interface ProcessManagerOptions {
  /** Path ke dist/relay.js milik @aethera/hook-relay. */
  relayPath: string;
  /** URL POST /hook-ingest yang bisa dijangkau dari proses agent (127.0.0.1). */
  hookUrl: string;
  /** Token rahasia yang harus dikirim relay; menolak POST dari proses lokal lain. */
  hookToken: string;
  claudeBin?: string;
  /** Default acceptEdits: agent boleh menulis file tanpa prompt. Bukan bypassPermissions. */
  permissionMode?: PermissionMode;
  /** Aturan izin tambahan, mis. ["Read", "Bash(npm test *)"]. */
  allowedTools?: string[];
  model?: string;
  /** Tambah --include-partial-messages (teks muncul bertahap di UI). */
  includePartialMessages?: boolean;
  /**
   * Tambah --permission-prompts none (Claude Code ≥ 2.1.259): permintaan izin yang tidak
   * tercakup aturan langsung ditolak alih-alih menggantung, dan agent diberi tahu.
   */
  denyUnansweredPrompts?: boolean;
  messageThrottleMs?: number;
  killTimeoutMs?: number;
  /** Disuntik test supaya tidak menjalankan CLI sungguhan. */
  spawnFn?: (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess;
  clock?: Pick<EventContext, 'now' | 'newId'>;
  log?: (msg: string) => void;
}

export interface SpawnAgentInput {
  runId: string;
  agent: AgentDefinition;
  task: string;
  workingDir: string;
  /** Lanjutkan sesi sebelumnya (`--resume`) alih-alih sesi baru. */
  resumeSessionId?: string;
}

interface AgentProcess {
  key: string;
  ctx: EventContext;
  child: ChildProcess;
  sessionId: string;
  status: AgentStatus;
  parser: StreamParserState;
  hooks: HookState;
  throttle: MessageThrottle;
  seenToolPre: Set<string>;
  seenToolPost: Set<string>;
  stderrTail: string[];
  startedAt: number;
  stopRequested: boolean;
  killTimer: NodeJS.Timeout | null;
  finished: boolean;
}

const STDERR_LINES = 50;

type ManagerEvents = {
  event: [AgentEvent];
  exit: [{ runId: string; agentId: string; sessionId: string; status: AgentStatus }];
};

function agentKey(runId: string, agentId: string): string {
  return `${runId}/${agentId}`;
}

/**
 * Menjalankan satu proses `claude -p` per agent dan menerjemahkan aktivitasnya jadi AgentEvent.
 * Sumber event: stdout stream-json (teks, sesi, token) + hook via /hook-ingest (tool call).
 * Tool event bisa datang dari keduanya; yang pertama menang, duplikat dibuang via toolUseId.
 */
export class AgentProcessManager extends EventEmitter<ManagerEvents> {
  private readonly procs = new Map<string, AgentProcess>();
  private readonly bySession = new Map<string, string>();
  private readonly opts: Required<
    Omit<ProcessManagerOptions, 'model' | 'spawnFn' | 'clock' | 'log'>
  > &
    Pick<ProcessManagerOptions, 'model'>;
  private readonly spawnFn: NonNullable<ProcessManagerOptions['spawnFn']>;
  private readonly clock: Pick<EventContext, 'now' | 'newId'>;
  private readonly log: (msg: string) => void;

  constructor(options: ProcessManagerOptions) {
    super();
    this.opts = {
      relayPath: options.relayPath,
      hookUrl: options.hookUrl,
      hookToken: options.hookToken,
      claudeBin: options.claudeBin ?? process.env.CLAUDE_BIN ?? 'claude',
      permissionMode: options.permissionMode ?? 'acceptEdits',
      allowedTools: options.allowedTools ?? [],
      model: options.model,
      includePartialMessages: options.includePartialMessages ?? true,
      denyUnansweredPrompts: options.denyUnansweredPrompts ?? true,
      messageThrottleMs: options.messageThrottleMs ?? 300,
      killTimeoutMs: options.killTimeoutMs ?? 5000,
    };
    this.spawnFn = options.spawnFn ?? spawn;
    this.clock = options.clock ?? defaultClock();
    this.log = options.log ?? (() => {});
  }

  /** Argumen CLI untuk satu agent (dipisah supaya bisa dites). */
  buildArgs(task: string, sessionId: string, resume: boolean): string[] {
    const args = ['-p', task, '--output-format', 'stream-json', '--verbose'];
    if (this.opts.includePartialMessages) args.push('--include-partial-messages');
    args.push(resume ? '--resume' : '--session-id', sessionId);
    args.push('--permission-mode', this.opts.permissionMode);
    if (this.opts.allowedTools.length > 0) {
      args.push('--allowedTools', this.opts.allowedTools.join(','));
    }
    if (this.opts.denyUnansweredPrompts) args.push('--permission-prompts', 'none');
    if (this.opts.model) args.push('--model', this.opts.model);
    args.push('--settings', buildHookSettings(this.opts.relayPath));
    return args;
  }

  buildEnv(runId: string, agentId: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env };
    // Wajib: kalau ANTHROPIC_API_KEY ada, CLI memakai API key (tagihan per token), bukan
    // login langganan Pro/Max.
    delete env.ANTHROPIC_API_KEY;
    env.AETHERA_HOOK_URL = this.opts.hookUrl;
    env.AETHERA_HOOK_TOKEN = this.opts.hookToken;
    env.AETHERA_RUN_ID = runId;
    env.AETHERA_AGENT_ID = agentId;
    return env;
  }

  isRunning(runId: string, agentId: string): boolean {
    const p = this.procs.get(agentKey(runId, agentId));
    return !!p && !p.finished;
  }

  runningAgents(): { runId: string; agentId: string }[] {
    return [...this.procs.values()]
      .filter((p) => !p.finished)
      .map((p) => ({ runId: p.ctx.runId, agentId: p.ctx.agentId }));
  }

  spawnAgent(input: SpawnAgentInput): { sessionId: string } {
    const { runId, agent, task, workingDir, resumeSessionId } = input;
    const key = agentKey(runId, agent.id);
    if (this.isRunning(runId, agent.id)) {
      throw new Error(`Agent ${agent.id} di run ${runId} masih berjalan`);
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.log('ANTHROPIC_API_KEY terdeteksi di env orchestrator; dihapus dari env proses agent.');
    }

    const sessionId = resumeSessionId ?? randomUUID();
    const ctx: EventContext = { runId, agentId: agent.id, cwd: workingDir, ...this.clock };
    const args = this.buildArgs(task, sessionId, !!resumeSessionId);
    const child = this.spawnFn(this.opts.claudeBin, args, {
      cwd: workingDir,
      env: this.buildEnv(runId, agent.id),
      // stdin ditutup: tanpa ini CLI menunggu 3 detik mencari input piped.
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const proc: AgentProcess = {
      key,
      ctx,
      child,
      sessionId,
      status: 'idle',
      parser: createStreamParserState(),
      hooks: createHookState(),
      throttle: new MessageThrottle(this.opts.messageThrottleMs, (text) =>
        this.emitEvent(makeEvent(ctx, 'agent.message', { text, partial: true })),
      ),
      seenToolPre: new Set(),
      seenToolPost: new Set(),
      stderrTail: [],
      startedAt: this.clock.now().getTime(),
      stopRequested: false,
      killTimer: null,
      finished: false,
    };
    this.procs.set(key, proc);
    this.bySession.set(sessionId, key);
    this.setStatus(proc, 'working', resumeSessionId ? 'melanjutkan sesi' : 'proses dimulai');

    if (child.stdout) {
      createInterface({ input: child.stdout }).on('line', (line) => this.onStdoutLine(proc, line));
    }
    if (child.stderr) {
      createInterface({ input: child.stderr }).on('line', (line) => {
        proc.stderrTail.push(line);
        if (proc.stderrTail.length > STDERR_LINES) proc.stderrTail.shift();
      });
    }
    child.on('error', (err) => {
      this.finish(proc, null, null, `Gagal menjalankan ${this.opts.claudeBin}: ${err.message}`);
    });
    child.on('close', (code, signal) => this.finish(proc, code, signal));

    return { sessionId };
  }

  /** SIGTERM dulu; SIGKILL bila belum keluar setelah killTimeoutMs. */
  stopAgent(runId: string, agentId: string): boolean {
    const proc = this.procs.get(agentKey(runId, agentId));
    if (!proc || proc.finished) return false;
    proc.stopRequested = true;
    proc.child.kill('SIGTERM');
    proc.killTimer = setTimeout(() => {
      if (!proc.finished) proc.child.kill('SIGKILL');
    }, this.opts.killTimeoutMs);
    proc.killTimer.unref();
    return true;
  }

  stopAll(): void {
    for (const p of this.procs.values()) this.stopAgent(p.ctx.runId, p.ctx.agentId);
  }

  getSessionId(runId: string, agentId: string): string | null {
    return this.procs.get(agentKey(runId, agentId))?.sessionId ?? null;
  }

  /**
   * Terima body dari hook-relay. Mengembalikan false bila token salah atau sesi tidak dikenal.
   */
  handleHook(body: unknown, token: string | undefined): boolean {
    if (token !== this.opts.hookToken) return false;
    if (!isRelayedHook(body)) return false;
    const proc = this.findProcForHook(body);
    if (!proc || proc.finished) return false;

    const result = translateHook(body, proc.ctx, proc.hooks);
    if (result.kind === 'blocked') {
      this.setStatus(proc, 'blocked', result.reason);
    } else if (result.kind === 'events') {
      for (const e of result.events) this.emitToolAware(proc, e);
    }
    return true;
  }

  private findProcForHook(hook: RelayedHook) {
    const key = this.bySession.get(hook.session_id);
    if (key) return this.procs.get(key);
    // Cadangan: id dari env yang diteruskan relay (sesi --resume bisa punya id berbeda).
    if (typeof hook.run_id === 'string' && typeof hook.agent_id === 'string') {
      const proc = this.procs.get(agentKey(hook.run_id, hook.agent_id));
      if (proc) this.bySession.set(hook.session_id, proc.key);
      return proc;
    }
    return undefined;
  }

  private onStdoutLine(proc: AgentProcess, line: string): void {
    const events = parseStreamLine(line, proc.ctx, proc.parser);
    if (proc.parser.sessionId && !this.bySession.has(proc.parser.sessionId)) {
      proc.sessionId = proc.parser.sessionId;
      this.bySession.set(proc.parser.sessionId, proc.key);
    }
    for (const e of events) {
      if (e.type === 'agent.message') {
        if (e.payload.partial) {
          proc.throttle.push(e.payload.text);
          continue;
        }
        proc.throttle.reset();
      }
      this.emitToolAware(proc, e);
    }
  }

  private emitToolAware(proc: AgentProcess, e: AgentEvent): void {
    if (e.type === 'agent.tool_pre') {
      if (proc.seenToolPre.has(e.payload.toolUseId)) return;
      proc.seenToolPre.add(e.payload.toolUseId);
      if (proc.status === 'blocked') this.setStatus(proc, 'working', 'izin didapat');
    } else if (e.type === 'agent.tool_post') {
      if (proc.seenToolPost.has(e.payload.toolUseId)) return;
      proc.seenToolPost.add(e.payload.toolUseId);
    }
    this.emitEvent(e);
  }

  private setStatus(proc: AgentProcess, to: AgentStatus, reason: string): void {
    if (proc.status === to) return;
    const from = proc.status;
    proc.status = to;
    this.emitEvent(makeEvent(proc.ctx, 'agent.status_change', { from, to, reason }));
  }

  private emitEvent(e: AgentEvent): void {
    this.emit('event', e);
  }

  private finish(
    proc: AgentProcess,
    code: number | null,
    signal: NodeJS.Signals | null,
    spawnError?: string,
  ): void {
    if (proc.finished) return;
    proc.finished = true;
    proc.throttle.reset();
    if (proc.killTimer) clearTimeout(proc.killTimer);

    const result = proc.parser.result;
    const exitCode =
      code ?? (signal === 'SIGKILL' ? 137 : signal === 'SIGTERM' ? 143 : spawnError ? 127 : 1);
    const failed = !proc.stopRequested && (!!spawnError || exitCode !== 0 || !!result?.isError);

    if (failed) {
      const detail =
        spawnError ??
        (result?.isError && result.resultText
          ? result.resultText
          : proc.stderrTail.slice(-10).join('\n') || `proses keluar dengan kode ${exitCode}`);
      this.emitEvent(makeEvent(proc.ctx, 'agent.error', { message: truncate(detail, 1000) }));
    }

    this.emitEvent(
      makeEvent(proc.ctx, 'agent.session_end', {
        exitCode,
        durationMs: result?.durationMs ?? Math.max(0, this.clock.now().getTime() - proc.startedAt),
        numTurns: result?.numTurns ?? 0,
        usage: result?.usage ?? ZERO_USAGE,
      }),
    );

    const finalStatus: AgentStatus = failed ? 'error' : 'done';
    this.setStatus(
      proc,
      finalStatus,
      proc.stopRequested ? 'dihentikan manager' : failed ? 'gagal' : 'tugas selesai',
    );
    this.emit('exit', {
      runId: proc.ctx.runId,
      agentId: proc.ctx.agentId,
      sessionId: proc.sessionId,
      status: finalStatus,
    });
  }
}
