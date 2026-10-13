import { formatRupiah, isUnpaid, type OrderView, type SettingsView } from '@bekuin/shared';
import { categoryLabel, formatDateKey } from './order-format';

/**
 * Nota/invoice pelanggan dalam bentuk gambar PNG, digambar di canvas (tanpa server & library).
 * Gambar dikirim lewat menu Bagikan HP (WhatsApp) atau diunduh.
 */

const WIDTH = 720; // px CSS; digambar 2× supaya tajam di layar HP
const SCALE = 2;
const PAD = 40;
const FONT = 'Inter, ui-sans-serif, system-ui, sans-serif';
const C = {
  brand: '#b91c1c',
  brandSoft: '#fef2f2',
  text: '#1c1917',
  muted: '#78716c',
  line: '#e7e5e4',
  green: '#15803d',
  greenSoft: '#dcfce7',
  amber: '#b45309',
  amberSoft: '#fef3c7',
  red: '#b91c1c',
  redSoft: '#fee2e2',
};

const dateTime = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Makassar',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export type InvoiceKind = 'NOTA' | 'TAGIHAN';

/** Order lunas → "NOTA"; belum dibayar (menunggu / COD) → "TAGIHAN". */
export function invoiceKind(order: OrderView): InvoiceKind {
  return order.status === 'PAID' && !isUnpaid(order) ? 'NOTA' : 'TAGIHAN';
}

/** Nota bisa dibuat untuk order yang masih berlaku (bukan ditolak/dibatalkan). */
export const canMakeInvoice = (order: OrderView) =>
  order.status === 'PENDING' || order.status === 'PAID' || order.status === 'VOIDED';

export const invoiceFileName = (order: OrderView) =>
  `${invoiceKind(order) === 'NOTA' ? 'Nota' : 'Tagihan'}-${order.orderNo}.png`;

function paymentBadge(order: OrderView): { text: string; fg: string; bg: string } {
  if (order.status === 'VOIDED') return { text: 'VOID / DIBATALKAN', fg: C.red, bg: C.redSoft };
  const method = order.paymentMethod?.name;
  if (order.status === 'PAID' && !isUnpaid(order))
    return { text: method ? `LUNAS · ${method}` : 'LUNAS', fg: C.green, bg: C.greenSoft };
  return {
    text: method ? `BELUM DIBAYAR · ${method}` : 'BELUM DIBAYAR',
    fg: C.amber,
    bg: C.amberSoft,
  };
}

/** Potong teks yang terlalu panjang dengan "…". */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

/** Pecah teks jadi beberapa baris sesuai lebar. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3) {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = fit(
      ctx,
      `${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`,
      maxWidth,
    );
    return kept;
  }
  return lines;
}

/**
 * Gambar nota. Dipanggil dua kali: sekali untuk mengukur tinggi (draw = false), lalu menggambar.
 * Balikan tinggi total (px CSS).
 */
function layout(
  ctx: CanvasRenderingContext2D,
  order: OrderView,
  store: SettingsView,
  draw: boolean,
): number {
  const right = WIDTH - PAD;
  const font = (weight: number, size: number) => {
    ctx.font = `${weight} ${size}px ${FONT}`;
  };
  const text = (
    s: string,
    x: number,
    y: number,
    opts: { color?: string; align?: CanvasTextAlign } = {},
  ) => {
    if (!draw) return;
    ctx.fillStyle = opts.color ?? C.text;
    ctx.textAlign = opts.align ?? 'left';
    ctx.fillText(s, x, y);
  };
  const rect = (x: number, y: number, w: number, h: number, color: string, radius = 0) => {
    if (!draw) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  };
  const hr = (y: number) => rect(PAD, y, WIDTH - PAD * 2, 1, C.line);
  ctx.textBaseline = 'alphabetic';

  // ── Kepala: nama toko + jenis dokumen
  const kind = invoiceKind(order);
  font(800, 30);
  const titleLines = wrap(ctx, store.storeName, WIDTH - PAD * 2 - 170, 2);
  const headerH = 64 + titleLines.length * 36 + (store.tagline ? 26 : 0);
  rect(0, 0, WIDTH, headerH, C.brand);
  let y = PAD + 30;
  titleLines.forEach((line, i) => text(line, PAD, y + i * 36, { color: '#fff' }));
  font(800, 22);
  text(kind, right, y, { color: '#fff', align: 'right' });
  font(500, 14);
  text(order.orderNo, right, y + 24, { color: '#fecaca', align: 'right' });
  y += (titleLines.length - 1) * 36;
  if (store.tagline) {
    font(400, 16);
    text(fit(ctx, store.tagline, WIDTH - PAD * 2 - 170), PAD, y + 28, { color: '#fecaca' });
  }
  y = headerH + 32;

  // ── Kontak toko
  const contact = [store.address, store.phone ? `WA ${store.phone}` : null].filter(Boolean);
  if (contact.length) {
    font(400, 15);
    for (const line of wrap(ctx, contact.join(' · '), WIDTH - PAD * 2, 2)) {
      text(line, PAD, y, { color: C.muted });
      y += 22;
    }
    y += 10;
  }

  // ── Info order
  const rows: [string, string][] = [
    ['No. Order', order.orderNo],
    ['Tanggal', dateTime.format(new Date(order.approvedAt ?? order.createdAt))],
  ];
  if (order.customerName) rows.push(['Pelanggan', order.customerName]);
  if (order.customerPhone) rows.push(['No. WA', order.customerPhone]);
  if (order.deliveryMethod === 'DELIVERY')
    rows.push(['Diantar', formatDateKey(order.deliveryDate)]);
  else if (order.deliveryMethod === 'PICKUP')
    rows.push(['Diambil', formatDateKey(order.deliveryDate)]);
  else if (order.type === 'PREORDER') rows.push(['Tgl kirim', formatDateKey(order.deliveryDate)]);
  if (order.deliveryAddress) rows.push(['Alamat', order.deliveryAddress]);
  for (const [label, value] of rows) {
    font(400, 16);
    text(label, PAD, y, { color: C.muted });
    font(600, 16);
    const lines = wrap(ctx, value, WIDTH - PAD * 2 - 140, 3);
    lines.forEach((line, i) => text(line, PAD + 140, y + i * 22));
    y += 22 * lines.length + 8;
  }
  y += 12;

  // ── Tabel item
  const colQty = WIDTH - PAD - 300;
  const colPrice = WIDTH - PAD - 150;
  rect(PAD, y, WIDTH - PAD * 2, 40, C.brandSoft, 10);
  font(700, 14);
  text('ITEM', PAD + 14, y + 26, { color: C.brand });
  text('QTY', colQty, y + 26, { color: C.brand, align: 'center' });
  text('HARGA', colPrice, y + 26, { color: C.brand, align: 'right' });
  text('SUBTOTAL', right - 14, y + 26, { color: C.brand, align: 'right' });
  y += 40;
  for (const item of order.items) {
    y += 30;
    font(600, 17);
    text(fit(ctx, item.productName, colQty - PAD - 60), PAD + 14, y);
    font(500, 17);
    text(`${item.qty}`, colQty, y, { align: 'center' });
    text(formatRupiah(item.price), colPrice, y, { align: 'right' });
    font(700, 17);
    text(formatRupiah(item.subtotal), right - 14, y, { align: 'right' });
    y += 22;
    font(400, 14);
    const detail = `${categoryLabel(item.categoryCode)} · isi ${item.packSize} pcs${item.note ? ` · ${item.note}` : ''}`;
    text(fit(ctx, detail, colQty - PAD - 60), PAD + 14, y, { color: C.muted });
    y += 16;
    hr(y);
  }
  y += 28;

  // ── Total
  const sumRow = (label: string, value: string, color = C.text) => {
    font(400, 17);
    text(label, colPrice - 120, y, { color: C.muted });
    font(600, 17);
    text(value, right - 14, y, { color, align: 'right' });
    y += 30;
  };
  sumRow('Subtotal', formatRupiah(order.subtotal));
  if (order.discount) sumRow('Diskon', `−${formatRupiah(order.discount)}`, C.green);
  if (order.deliveryFee) sumRow('Ongkir', formatRupiah(order.deliveryFee));
  y += 4;
  rect(colPrice - 136, y - 6, right - colPrice + 136, 56, C.brandSoft, 12);
  font(700, 18);
  text('TOTAL', colPrice - 120, y + 29, { color: C.brand });
  font(800, 26);
  text(formatRupiah(order.total), right - 14, y + 31, { color: C.brand, align: 'right' });
  y += 76;

  // ── Status bayar
  const badge = paymentBadge(order);
  font(700, 16);
  const badgeW = ctx.measureText(badge.text).width + 36;
  rect(PAD, y, badgeW, 38, badge.bg, 19);
  text(badge.text, PAD + 18, y + 25, { color: badge.fg });
  if (order.status === 'PAID' && !isUnpaid(order) && order.changeAmount) {
    font(400, 15);
    text(
      `Dibayar ${formatRupiah(order.paidAmount ?? order.total)} · kembali ${formatRupiah(order.changeAmount)}`,
      right,
      y + 25,
      { color: C.muted, align: 'right' },
    );
  }
  y += 62;

  if (order.note) {
    font(400, 15);
    for (const line of wrap(ctx, `Catatan: ${order.note}`, WIDTH - PAD * 2, 3)) {
      text(line, PAD, y, { color: C.muted });
      y += 22;
    }
    y += 8;
  }

  // ── Penutup
  hr(y);
  y += 32;
  const footer = (store.receiptFooter ?? '').split('\n').filter(Boolean);
  font(500, 15);
  for (const line of footer.length ? footer : ['Terima kasih sudah berbelanja!']) {
    for (const part of wrap(ctx, line, WIDTH - PAD * 2, 2)) {
      text(part, WIDTH / 2, y, { color: C.muted, align: 'center' });
      y += 22;
    }
  }
  return y + PAD - 12;
}

/** Buat gambar PNG nota. */
export async function renderInvoicePng(order: OrderView, store: SettingsView): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser tidak bisa membuat gambar nota');
  const height = Math.ceil(layout(ctx, order, store, false));
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, WIDTH, height);
  layout(ctx, order, store, true);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Gagal membuat gambar nota'))),
      'image/png',
    ),
  );
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Teks pendamping gambar saat dibagikan ke WhatsApp. */
export function invoiceCaption(order: OrderView, store: SettingsView) {
  const who = order.customerName ? `Halo kak ${order.customerName}, ` : 'Halo kak, ';
  return invoiceKind(order) === 'NOTA'
    ? `${who}berikut nota pesanan ${order.orderNo} dari ${store.storeName}. Total ${formatRupiah(order.total)} (lunas). Terima kasih!`
    : `${who}berikut tagihan pesanan ${order.orderNo} dari ${store.storeName}. Total ${formatRupiah(order.total)}.`;
}

/**
 * Bagikan nota lewat menu Bagikan HP (pilih WhatsApp). Bila browser tidak mendukung berbagi file
 * (mis. laptop), gambar diunduh. Balikan 'shared' | 'downloaded' | 'cancelled'.
 */
export async function shareInvoice(
  order: OrderView,
  store: SettingsView,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await renderInvoicePng(order, store);
  const file = new File([blob], invoiceFileName(order), { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: invoiceCaption(order, store) });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      throw e;
    }
  }
  downloadBlob(blob, file.name);
  return 'downloaded';
}
