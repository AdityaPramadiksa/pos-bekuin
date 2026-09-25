import { formatNumber, type OrderView, type SettingsView } from '@bekuin/shared';
import { categoryLabel, formatDateKey } from '@/features/orders/order-format';
import { connectedPrinterName, printBytes } from './bluetooth';
import { EscPosBuilder } from './escpos';

export type ReceiptLine =
  | { kind: 'text'; text: string; align?: 'left' | 'center'; bold?: boolean; big?: boolean }
  | { kind: 'pair'; left: string; right: string; bold?: boolean; big?: boolean }
  | { kind: 'divider' }
  | { kind: 'feed' };

const WIDTH = 32;

const dt = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Makassar',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "21/09/2026 14:32" (WITA) */
function receiptDate(iso: string) {
  const parts = Object.fromEntries(dt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

const clip = (s: string, n = WIDTH) => (s.length > n ? s.slice(0, n) : s);

/** Susunan struk (PRD bagian 8). Dipakai untuk pratinjau layar & cetak ESC/POS. */
export function receiptLines(
  order: OrderView,
  store: SettingsView,
  options: { reprint?: boolean } = {},
): ReceiptLine[] {
  const lines: ReceiptLine[] = [
    { kind: 'text', text: store.storeName.toUpperCase(), align: 'center', bold: true, big: true },
  ];
  if (store.tagline) lines.push({ kind: 'text', text: store.tagline, align: 'center' });
  if (store.address) lines.push({ kind: 'text', text: clip(store.address), align: 'center' });
  if (store.phone) lines.push({ kind: 'text', text: `WA ${store.phone}`, align: 'center' });
  lines.push({ kind: 'divider' });

  const field = (label: string, value: string) => ({
    kind: 'text' as const,
    text: clip(`${label.padEnd(6)}: ${value}`),
  });
  lines.push(field('No', order.orderNo));
  lines.push(field('Tgl', receiptDate(order.approvedAt ?? order.createdAt)));
  const cashier = order.createdBy?.name ?? 'Pelanggan';
  lines.push(
    field(
      'Kasir',
      order.approvedBy && order.approvedBy.name !== cashier
        ? `${cashier}  Admin: ${order.approvedBy.name}`
        : cashier,
    ),
  );
  if (order.customerName || order.table) {
    lines.push(field('Plgn', [order.customerName, order.table?.name].filter(Boolean).join(' · ')));
  }
  if (order.type === 'PREORDER') lines.push(field('Kirim', formatDateKey(order.deliveryDate)));
  if (order.source === 'QR_TABLE') lines.push(field('Sumber', 'QR Meja'));
  lines.push({ kind: 'divider' });

  const groups = new Map<string, OrderView['items']>();
  for (const item of order.items)
    groups.set(item.categoryCode, [...(groups.get(item.categoryCode) ?? []), item]);
  for (const [code, items] of groups) {
    lines.push({ kind: 'text', text: categoryLabel(code).toUpperCase(), bold: true });
    for (const item of items) {
      lines.push({ kind: 'text', text: clip(`${item.productName} ${item.packSize}pcs`) });
      lines.push({
        kind: 'pair',
        left: `  ${item.qty} x ${formatNumber(item.price)}`,
        right: formatNumber(item.subtotal),
      });
      if (item.note) lines.push({ kind: 'text', text: clip(`  * ${item.note}`) });
    }
  }
  lines.push({ kind: 'divider' });
  lines.push({ kind: 'pair', left: 'Subtotal', right: formatNumber(order.subtotal) });
  if (order.discount)
    lines.push({ kind: 'pair', left: 'Diskon', right: `-${formatNumber(order.discount)}` });
  lines.push({
    kind: 'pair',
    left: 'TOTAL',
    right: formatNumber(order.total),
    bold: true,
    big: true,
  });
  if (order.paymentMethod) {
    lines.push({
      kind: 'pair',
      left: order.paymentMethod.name,
      right: formatNumber(order.paidAmount ?? order.total),
    });
    if (order.changeAmount)
      lines.push({ kind: 'pair', left: 'Kembali', right: formatNumber(order.changeAmount) });
  } else {
    lines.push({ kind: 'text', text: '*** BELUM DIBAYAR ***', align: 'center', bold: true });
  }
  if (order.status === 'VOIDED')
    lines.push({ kind: 'text', text: '*** VOID ***', align: 'center', bold: true });
  if (order.note) lines.push({ kind: 'text', text: clip(`Catatan: ${order.note}`) });
  lines.push({ kind: 'divider' });
  for (const footer of (store.receiptFooter ?? '').split('\n').filter(Boolean)) {
    lines.push({ kind: 'text', text: clip(footer), align: 'center' });
  }
  if (options.reprint) lines.push({ kind: 'text', text: '(cetak ulang)', align: 'center' });
  lines.push({ kind: 'feed' });
  return lines;
}

/** Ubah susunan baris menjadi byte ESC/POS. */
export function linesToEscPos(lines: ReceiptLine[]): Uint8Array {
  const b = new EscPosBuilder(WIDTH);
  for (const line of lines) {
    if (line.kind === 'divider') b.divider();
    else if (line.kind === 'feed') b.feed(4);
    else if (line.kind === 'text') {
      b.align(line.align ?? 'left')
        .bold(!!line.bold)
        .size(line.big ? 'double' : 'normal');
      b.line(line.big ? line.text.slice(0, WIDTH / 2) : line.text);
      b.size('normal').bold(false).align('left');
    } else {
      b.bold(!!line.bold);
      if (line.big) {
        // Lebar ganda: 16 kolom per baris.
        b.size('double');
        const space = Math.max(1, WIDTH / 2 - line.left.length - line.right.length);
        b.line(line.left + ' '.repeat(space) + line.right);
        b.size('normal');
      } else {
        b.pair(line.left, line.right);
      }
      b.bold(false);
    }
  }
  return b.build();
}

/** Teks polos 32 kolom untuk pratinjau di layar. */
export function linesToText(lines: ReceiptLine[]): string {
  const center = (s: string) => ' '.repeat(Math.max(0, Math.floor((WIDTH - s.length) / 2))) + s;
  return lines
    .map((line) => {
      if (line.kind === 'divider') return '-'.repeat(WIDTH);
      if (line.kind === 'feed') return '';
      if (line.kind === 'text') return line.align === 'center' ? center(line.text) : line.text;
      const space = Math.max(1, WIDTH - line.left.length - line.right.length);
      return line.left + ' '.repeat(space) + line.right;
    })
    .join('\n');
}

export function isPrinterConnected() {
  return connectedPrinterName() !== null;
}

/** Cetak struk; lempar error bila printer belum terhubung atau gagal. */
export async function printReceipt(
  order: OrderView,
  store: SettingsView,
  options: { reprint?: boolean } = {},
) {
  if (!isPrinterConnected()) throw new Error('Printer belum terhubung. Buka Lainnya → Printer.');
  await printBytes(linesToEscPos(receiptLines(order, store, options)));
}
