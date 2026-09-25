import type { OrderView } from '@bekuin/shared';

export const CATEGORY_LABEL: Record<string, string> = {
  FROZEN: 'Frozen',
  SIAP_MAKAN: 'Siap Makan',
};
export const categoryLabel = (code: string) => CATEGORY_LABEL[code] ?? code.replaceAll('_', ' ');

const time = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Makassar',
  hour: '2-digit',
  minute: '2-digit',
});
const dateTime = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Makassar',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const dateOnly = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'UTC',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
});

export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
/** Tanggal kirim (YYYY-MM-DD) → "Sab, 27 Sep" */
export const formatDateKey = (key: string) => dateOnly.format(new Date(`${key}T00:00:00Z`));

/** "5 mnt lalu" */
export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} mnt lalu`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} jam lalu` : `${Math.floor(hours / 24)} hari lalu`;
}

/** "Udang Keju 6pcs ×2, Risol Mayo 6pcs ×1" */
export const itemsSummary = (order: OrderView) =>
  order.items.map((i) => `${i.productName} ${i.packSize}pcs ×${i.qty}`).join(', ');

/** Tanggal hari ini/besok dalam WITA (YYYY-MM-DD). */
export function dateKeyWita(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(d);
}

export const fmtQty = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
