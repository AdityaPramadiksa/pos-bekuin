const numberFmt = new Intl.NumberFormat('id-ID');
const compactFmt = new Intl.NumberFormat('id-ID', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatNumber(n: number): string {
  return numberFmt.format(n);
}

export function formatCompact(n: number): string {
  return compactFmt.format(n);
}

/** "0j 01m 14s" */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}j ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

/** Jam lokal HH:MM:SS dari ISO timestamp. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
