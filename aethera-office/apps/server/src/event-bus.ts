import { EventEmitter } from 'node:events';
import type { AgentEvent, ManagerInstruction, RoadmapItem, RunSummary } from '@aethera/shared';

export type BusMessage =
  | { kind: 'event'; event: AgentEvent }
  | { kind: 'run'; run: RunSummary }
  | { kind: 'roadmap'; runId: string; items: RoadmapItem[] }
  | { kind: 'instruction'; instruction: ManagerInstruction };

/**
 * Jalur broadcast event yang sudah tersimpan. Implementasi sekarang in-process; kalau server
 * perlu lebih dari satu instance, ganti dengan implementasi Redis pub/sub tanpa mengubah
 * pemanggil.
 */
export interface EventBus {
  publish(msg: BusMessage): void;
  subscribe(listener: (msg: BusMessage) => void): () => void;
}

export class InProcessEventBus implements EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(msg: BusMessage): void {
    this.emitter.emit('msg', msg);
  }

  subscribe(listener: (msg: BusMessage) => void): () => void {
    this.emitter.on('msg', listener);
    return () => this.emitter.off('msg', listener);
  }
}
