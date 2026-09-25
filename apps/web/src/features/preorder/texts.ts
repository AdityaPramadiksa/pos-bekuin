import {
  formatRupiah,
  type OrderView,
  type ProductionPlanView,
  STOCK_UNIT_LABEL,
} from '@bekuin/shared';
import { EscPosBuilder } from '@/features/printer/escpos';
import { categoryLabel, fmtQty, formatDateKey } from '@/features/orders/order-format';

const variantLabel = (key: string) => {
  const [code, pack] = key.split('|');
  return `${categoryLabel(code)} ${pack}`;
};

/** Teks rekap produksi + daftar belanja untuk dikirim ke WhatsApp. */
export function planText(plan: ProductionPlanView): string {
  const out: string[] = [];
  out.push(`*REKAP PRODUKSI ${formatDateKey(plan.date).toUpperCase()}*`);
  out.push(
    `${plan.summary.customers} pelanggan · ${plan.summary.packs} pack · ${plan.summary.pcs} pcs · ${formatRupiah(plan.summary.amount)}`,
    '',
  );
  out.push('*Produk*');
  for (const p of plan.products) {
    const detail = Object.entries(p.byVariant)
      .map(([k, v]) => `${variantLabel(k)}×${v}`)
      .join(', ');
    out.push(
      `- ${p.productName}: ${p.totalPcs} pcs (${detail})${p.stockPcs > 0 ? ` · stok ${p.stockPcs} → buat ${p.toProduce}` : ''}`,
    );
  }
  if (plan.semiFinished.length) {
    out.push('', '*Adonan / setengah jadi*');
    for (const s of plan.semiFinished) {
      const u = STOCK_UNIT_LABEL[s.baseUnit];
      out.push(
        `- ${s.name}: butuh ${fmtQty(s.need)} ${u}${s.stock > 0 ? `, stok ${fmtQty(s.stock)}` : ''} → ${s.batches} batch (${fmtQty(s.willMake)} ${u})`,
      );
    }
  }
  const shop = plan.materials.filter((m) => m.shortage > 0);
  out.push('', '*Daftar belanja*');
  if (shop.length === 0) out.push('- Semua bahan cukup ✅');
  for (const m of shop) {
    out.push(
      `- ${m.name}: ${fmtQty(m.shortage)} ${STOCK_UNIT_LABEL[m.baseUnit]} → ${m.packsToBuy} ${m.purchaseUnit ?? 'kemasan'} (±${formatRupiah(m.estimatedCost)})`,
    );
  }
  if (shop.length) out.push(`Total estimasi: ${formatRupiah(plan.shoppingTotal)}`);
  if (plan.fryList.length) {
    out.push('', '*Digoreng hari kirim*');
    for (const f of plan.fryList) out.push(`- ${f.productName} isi ${f.packSize} × ${f.qty}`);
  }
  return out.join('\n');
}

/** Teks tagihan per pelanggan untuk WhatsApp. */
export function invoiceText(order: OrderView, storeName: string): string {
  const lines = order.items.map(
    (i) =>
      `- ${i.productName} isi ${i.packSize} (${categoryLabel(i.categoryCode)}) ×${i.qty} = ${formatRupiah(i.subtotal)}`,
  );
  return [
    `Halo ${order.customerName ?? 'Kak'} 🙏`,
    `Pesanan ${storeName} untuk ${formatDateKey(order.deliveryDate)}:`,
    ...lines,
    ...(order.discount ? [`Diskon -${formatRupiah(order.discount)}`] : []),
    `*Total ${formatRupiah(order.total)}*`,
    order.status === 'PAID' ? 'Status: LUNAS ✅ Terima kasih!' : 'Terima kasih 🙏',
  ].join('\n');
}

/** Label 58mm untuk ditempel di kantong pesanan. */
export function labelBytes(order: OrderView, storeName: string): Uint8Array {
  const b = new EscPosBuilder(32).align('center').bold(true).size('double');
  b.line((order.customerName ?? order.orderNo).slice(0, 16))
    .size('normal')
    .bold(false);
  b.line(`${storeName} · ${formatDateKey(order.deliveryDate)}`)
    .divider()
    .align('left');
  const hasMatang = order.items.some((i) => i.categoryCode === 'SIAP_MAKAN');
  const hasFrozen = order.items.some((i) => i.categoryCode !== 'SIAP_MAKAN');
  for (const i of order.items) {
    b.line(
      `${i.qty}x ${i.productName} ${i.packSize}pcs${i.categoryCode === 'SIAP_MAKAN' ? ' (M)' : ''}`.slice(
        0,
        32,
      ),
    );
  }
  b.divider()
    .align('center')
    .bold(true)
    .line(hasMatang && hasFrozen ? 'FROZEN + MATANG' : hasMatang ? 'MATANG' : 'FROZEN')
    .bold(false);
  b.line(order.orderNo).feed(3);
  return b.build();
}

/** Rekap ringkas 58mm. */
export function planBytes(plan: ProductionPlanView): Uint8Array {
  const b = new EscPosBuilder(32)
    .align('center')
    .bold(true)
    .line('REKAP PRODUKSI')
    .bold(false)
    .line(formatDateKey(plan.date));
  b.line(`${plan.summary.packs} pack · ${plan.summary.pcs} pcs`).divider().align('left');
  for (const p of plan.products) b.pair(p.productName.slice(0, 22), `${p.toProduce} pcs`);
  if (plan.semiFinished.length) b.divider();
  for (const s of plan.semiFinished) b.pair(s.name.slice(0, 20), `${s.batches} batch`);
  const shop = plan.materials.filter((m) => m.shortage > 0);
  if (shop.length) b.divider().bold(true).line('BELANJA').bold(false);
  for (const m of shop)
    b.pair(m.name.slice(0, 20), `${m.packsToBuy} ${(m.purchaseUnit ?? 'x').split(' ')[0]}`);
  if (plan.fryList.length) b.divider().bold(true).line('GORENG HARI KIRIM').bold(false);
  for (const f of plan.fryList) b.pair(`${f.productName} ${f.packSize}`.slice(0, 24), `x${f.qty}`);
  return b.feed(4).build();
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
