import { MESSAGE_TEXT_MAX } from '@aethera/shared';

function tail(text: string, max: number): string {
  return text.length <= max ? text : `…${text.slice(text.length - (max - 1))}`;
}

/**
 * Menggabung delta teks (--include-partial-messages) dan memancarkannya paling sering sekali
 * tiap `intervalMs`, supaya tidak ada satu event per token.
 */
export class MessageThrottle {
  private buffer = '';
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly emitPartial: (text: string) => void,
  ) {}

  push(delta: string): void {
    this.buffer += delta;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.buffer) this.emitPartial(tail(this.buffer, MESSAGE_TEXT_MAX));
    }, this.intervalMs);
  }

  /** Pesan utuh datang: buang buffer parsial yang belum terkirim. */
  reset(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.buffer = '';
  }
}
