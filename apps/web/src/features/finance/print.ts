import {
  formatNumber,
  type CashSessionView,
  type DailyClosingReport,
  type SettingsView,
} from '@bekuin/shared';
import { formatDateKey, formatDateTime } from '@/features/orders/order-format';
import type { ReceiptLine } from '@/features/printer/receipt';

const rp = (n: number) => formatNumber(n);
const signed = (n: number) => (n > 0 ? `+${rp(n)}` : rp(n));
const clip = (s: string, n = 20) => (s.length > n ? s.slice(0, n) : s);

function header(store: SettingsView, title: string, sub: string): ReceiptLine[] {
  return [
    { kind: 'text', text: store.storeName.toUpperCase(), align: 'center', bold: true },
    { kind: 'text', text: title, align: 'center', bold: true },
    { kind: 'text', text: sub, align: 'center' },
    { kind: 'divider' },
  ];
}

/** Rekap tutup shift 58mm (PRD 5.14). */
export function shiftLines(s: CashSessionView, store: SettingsView): ReceiptLine[] {
  const lines = header(store, 'TUTUP SHIFT', `Buka ${formatDateTime(s.openedAt)}`);
  if (s.closedAt) lines.push({ kind: 'text', text: `Tutup ${formatDateTime(s.closedAt)}` });
  lines.push(
    { kind: 'text', text: `Kasir: ${s.closedByName ?? s.openedByName}` },
    { kind: 'divider' },
    { kind: 'pair', left: 'Jumlah order', right: String(s.summary.orders) },
    { kind: 'pair', left: 'Penjualan', right: rp(s.summary.sales), bold: true },
  );
  for (const m of s.summary.byMethod)
    lines.push({ kind: 'pair', left: ` ${clip(m.label)} (${m.count})`, right: rp(m.amount) });
  for (const c of s.summary.byCategory)
    lines.push({ kind: 'pair', left: ` ${clip(c.label)} ${c.packs}pk`, right: rp(c.amount) });
  if (s.summary.voided.count)
    lines.push({
      kind: 'pair',
      left: `Void (${s.summary.voided.count})`,
      right: rp(s.summary.voided.amount),
    });
  lines.push(
    { kind: 'divider' },
    { kind: 'pair', left: 'Modal awal', right: rp(s.openingCash) },
    { kind: 'pair', left: '+ Penjualan cash', right: rp(s.summary.cashSales) },
    { kind: 'pair', left: '- Pengeluaran cash', right: rp(s.summary.cashExpenses) },
    {
      kind: 'pair',
      left: 'Kas seharusnya',
      right: rp(s.expectedCash ?? s.summary.expectedCash),
      bold: true,
    },
  );
  if (s.countedCash !== null) {
    lines.push(
      { kind: 'pair', left: 'Kas fisik', right: rp(s.countedCash), bold: true },
      { kind: 'pair', left: 'Selisih', right: signed(s.difference ?? 0), bold: true },
    );
  }
  if (s.note) lines.push({ kind: 'text', text: `Catatan: ${s.note}` });
  lines.push({ kind: 'feed' });
  return lines;
}

/** Rekap tutup hari 58mm. */
export function closingLines(r: DailyClosingReport, store: SettingsView): ReceiptLine[] {
  const lines = header(store, 'REKAP HARIAN', formatDateKey(r.date));
  lines.push(
    { kind: 'pair', left: 'Order lunas', right: String(r.summary.orders) },
    { kind: 'pair', left: 'Omzet kotor', right: rp(r.summary.grossSales) },
    { kind: 'pair', left: 'Diskon', right: rp(r.summary.discount) },
    { kind: 'pair', left: 'Omzet bersih', right: rp(r.summary.netSales), bold: true },
  );
  for (const m of r.byMethod)
    lines.push({ kind: 'pair', left: ` ${clip(m.label)} (${m.count})`, right: rp(m.amount) });
  for (const c of r.byCategory)
    lines.push({ kind: 'pair', left: ` ${clip(c.label)} ${c.packs}pk`, right: rp(c.amount) });
  lines.push(
    { kind: 'divider' },
    { kind: 'pair', left: 'HPP', right: rp(r.summary.hpp) },
    { kind: 'pair', left: 'Laba kotor', right: rp(r.summary.grossProfit), bold: true },
    { kind: 'pair', left: 'Pengeluaran', right: rp(r.expenses.total) },
    { kind: 'pair', left: 'Waste', right: rp(r.waste) },
    { kind: 'pair', left: 'Laba bersih', right: rp(r.netProfit), bold: true },
    { kind: 'divider' },
    { kind: 'pair', left: 'Belanja bahan', right: rp(r.purchases) },
    {
      kind: 'pair',
      left: `Void (${r.excluded.voided.count})`,
      right: rp(r.excluded.voided.amount),
    },
    {
      kind: 'pair',
      left: 'Ditolak/batal',
      right: String(r.excluded.rejected.count + r.excluded.cancelled.count),
    },
    { kind: 'pair', left: 'Masih menunggu', right: String(r.pending) },
  );
  for (const s of r.shifts) {
    lines.push({ kind: 'divider' }, { kind: 'text', text: `Shift ${formatDateTime(s.openedAt)}` });
    lines.push({
      kind: 'pair',
      left: ' Kas seharusnya',
      right: rp(s.expectedCash ?? s.summary.expectedCash),
    });
    if (s.countedCash !== null)
      lines.push({ kind: 'pair', left: ' Selisih', right: signed(s.difference ?? 0) });
  }
  lines.push({ kind: 'feed' });
  return lines;
}
