import type { ProcessingSummary } from '@bekuin/shared';
import { categoryLabel } from '@/features/orders/order-format';
import { EscPosBuilder } from '@/features/printer/escpos';

const lineText = (l: { categoryCode: string; packSize: number; packs: number }) =>
  `${categoryLabel(l.categoryCode)} isi ${l.packSize} ×${l.packs}`;

/** Rangkuman yang harus disiapkan, untuk dikirim ke WhatsApp tim. */
export function summaryText(summary: ProcessingSummary, title: string): string {
  const out = [
    `*SIAPKAN ${title.toUpperCase()}*`,
    `${summary.orders} order · ${summary.packs} pack · ${summary.pcs} pcs`,
    '',
  ];
  for (const r of summary.rows) {
    out.push(`- ${r.productName}: ${r.pcs} pcs (${r.lines.map(lineText).join(', ')})`);
  }
  if (summary.fryPacks) out.push('', `Goreng dulu: ${summary.fryPacks} pack siap makan`);
  return out.join('\n');
}

/** Rangkuman 58mm untuk ditempel di meja packing. */
export function summaryBytes(summary: ProcessingSummary, title: string): Uint8Array {
  const b = new EscPosBuilder(32)
    .align('center')
    .bold(true)
    .line('SIAPKAN')
    .bold(false)
    .line(title.slice(0, 32))
    .line(`${summary.orders} order · ${summary.packs} pack · ${summary.pcs} pcs`)
    .divider()
    .align('left');
  for (const r of summary.rows) {
    b.bold(true).pair(r.productName.slice(0, 22), `${r.pcs} pcs`).bold(false);
    for (const l of r.lines) b.line(`  ${lineText(l)}`.slice(0, 32));
  }
  if (summary.fryPacks) b.divider().line(`Goreng dulu: ${summary.fryPacks} pack`);
  return b.feed(4).build();
}
