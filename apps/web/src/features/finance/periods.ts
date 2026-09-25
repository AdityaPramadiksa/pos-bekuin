import { dateKeyWita } from '@/features/orders/order-format';

export type PeriodKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Hari ini' },
  { key: 'yesterday', label: 'Kemarin' },
  { key: '7d', label: '7 hari' },
  { key: '30d', label: '30 hari' },
  { key: 'month', label: 'Bulan ini' },
  { key: 'custom', label: 'Pilih tanggal' },
];

/** Rentang tanggal WITA untuk preset periode. */
export function periodRange(key: Exclude<PeriodKey, 'custom'>): { from: string; to: string } {
  const today = dateKeyWita(0);
  switch (key) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: dateKeyWita(-1), to: dateKeyWita(-1) };
    case '7d':
      return { from: dateKeyWita(-6), to: today };
    case '30d':
      return { from: dateKeyWita(-29), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}
