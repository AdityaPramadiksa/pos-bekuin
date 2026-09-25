/**
 * Parser pesan WhatsApp → order per pelanggan (PRD 5.12, .claude/skills/bekuin-parser).
 * Fungsi murni: tidak menyentuh DB, semua data katalog diberikan lewat argumen.
 */
import type {
  ImportCatalog,
  ParsedBatch,
  ParsedCustomer,
  ParsedLine,
  ParseStatus,
} from '@bekuin/shared';
import { normalizeName } from '@bekuin/shared';

const ITEM_MARKER = /^\s*(?:[-•.*·▪]+|\d{1,2}[.)])\s*/;
const HEADER_WORDS = /\b(order|oderan|orderan|odr|pesanan)\b/;
const CATEGORY_WORDS = /\b(mateng|matang|digoreng|siap\s*makan)\b/;
const SIZE = /\(?\s*(\d{1,2})\s*pcs\b\s*\)?/;
const QTY = /\b(\d{1,3})\s*x\b|\bx\s*(\d{1,3})\b/;

export interface ParseOptions {
  /** Tanggal hari ini YYYY-MM-DD (WITA). */
  today: string;
  /** Tanggal kirim bila tidak ada kata besok/lusa. */
  defaultDeliveryDate?: string;
}

/** Huruf kecil, buang emoji & simbol, samakan psc/pc → pcs, rapikan spasi. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/(?:[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]|\u{FE0F}|\u{200D})/gu, ' ')
    .replace(/(\d)(psc|pcs|pc|pieces|biji)\b/g, '$1 $2')
    .replace(/\b(psc|pc|pcs\.?|pieces|biji)\b/g, 'pcs')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const addDays = (key: string, days: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

interface Candidate {
  phrase: string;
  productId: string;
  words: number;
}

interface ProductMatch {
  productId: string;
  kind: 'exact' | 'token' | 'fuzzy';
  residual: string;
  matchedText: string;
}

function buildCandidates(catalog: ImportCatalog): Candidate[] {
  const seen = new Set<string>();
  const list: Candidate[] = [];
  const push = (phrase: string, productId: string) => {
    const p = normalizeText(phrase);
    if (!p || seen.has(p)) return;
    seen.add(p);
    list.push({ phrase: p, productId, words: p.split(' ').length });
  };
  for (const a of catalog.aliases) push(a.alias, a.productId);
  for (const p of catalog.products) push(p.name, p.id);
  // Frasa terpanjang dulu: "dimsum goreng keju" menang atas "goreng keju".
  return list.sort((a, b) => b.phrase.length - a.phrase.length);
}

/** Alias/nama persis → semua token nama produk → toleran typo (jarak edit kecil). */
export function matchProduct(
  text: string,
  candidates: Candidate[],
  catalog: ImportCatalog,
  allowFuzzy = true,
): ProductMatch | null {
  for (const c of candidates) {
    const re = new RegExp(`(?:^|\\s)${escapeRe(c.phrase)}(?=\\s|$)`);
    if (re.test(text)) {
      return {
        productId: c.productId,
        kind: 'exact',
        residual: text.replace(re, ' ').trim(),
        matchedText: c.phrase,
      };
    }
  }
  const tokens = text.split(' ');
  for (const p of catalog.products) {
    const nameTokens = normalizeText(p.name).split(' ');
    if (nameTokens.every((t) => tokens.includes(t))) {
      return {
        productId: p.id,
        kind: 'token',
        residual: tokens.filter((t) => !nameTokens.includes(t)).join(' '),
        matchedText: nameTokens.join(' '),
      };
    }
  }
  if (!allowFuzzy) return null;
  let best: { c: Candidate; dist: number; start: number } | null = null;
  for (const c of candidates) {
    const limit = c.phrase.length <= 5 ? 1 : 2;
    for (let start = 0; start + c.words <= tokens.length; start++) {
      const window = tokens.slice(start, start + c.words).join(' ');
      if (/\d/.test(window)) continue;
      const dist = levenshtein(window, c.phrase);
      if (
        dist <= limit &&
        (!best ||
          dist < best.dist ||
          (dist === best.dist && c.phrase.length > best.c.phrase.length))
      ) {
        best = { c, dist, start };
      }
    }
  }
  if (!best) return null;
  const rest = [...tokens.slice(0, best.start), ...tokens.slice(best.start + best.c.words)];
  return {
    productId: best.c.productId,
    kind: 'fuzzy',
    residual: rest.join(' '),
    matchedText: tokens.slice(best.start, best.start + best.c.words).join(' '),
  };
}

/** Pisahkan ukuran pack & jumlah dari teks item. */
function extractSizeQty(text: string): { rest: string; packSize: number | null; qty: number } {
  let rest = text;
  let packSize: number | null = null;
  const size = rest.match(SIZE);
  if (size) {
    packSize = Number(size[1]);
    rest = rest.replace(SIZE, ' ');
  }
  let qty = 1;
  const q = rest.match(QTY);
  if (q) {
    qty = Number(q[1] ?? q[2]);
    rest = rest.replace(QTY, ' ');
  }
  rest = rest
    .replace(/[()[\]:,;/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { rest, packSize, qty };
}

function cleanCustomerName(line: string): string {
  return titleCase(
    line
      .replace(/\([^)]*\)/g, ' ')
      .replace(CATEGORY_WORDS, ' ')
      .replace(/[:\-–—•*.,]+$/g, ' ')
      .replace(/^[:\-–—•*.,\s]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

export function parseOrderText(
  text: string,
  catalog: ImportCatalog,
  options: ParseOptions,
): ParsedBatch {
  const candidates = buildCandidates(catalog);
  const products = new Map(catalog.products.map((p) => [p.id, p]));
  const customers: ParsedCustomer[] = [];
  const ignoredLines: { lineNo: number; raw: string }[] = [];
  let deliveryDate = options.defaultDeliveryDate ?? options.today;
  let headerDetected = false;
  let current: (ParsedCustomer & { siapMakan: boolean }) | null = null;

  const startCustomer = (name: string, siapMakan: boolean) => {
    current = {
      key: `c${customers.length + 1}`,
      name,
      nameNormalized: normalizeName(name),
      merged: false,
      isNew: false,
      customerId: null,
      lines: [],
      total: 0,
      siapMakan,
    };
    customers.push(current);
    return current;
  };

  text.split(/\r?\n/).forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const raw = rawLine.trim();
    if (!raw) return;
    const hasMarker = ITEM_MARKER.test(raw);
    const norm = normalizeText(raw.replace(ITEM_MARKER, ''));
    if (!norm) return;

    // Header: sebelum pelanggan pertama, berisi kata order/pesanan.
    if (
      customers.length === 0 &&
      !hasMarker &&
      HEADER_WORDS.test(norm) &&
      !matchProduct(norm, candidates, catalog, false)
    ) {
      headerDetected = true;
      if (/\blusa\b/.test(norm)) deliveryDate = addDays(options.today, 2);
      else if (/\b(besok|bsk|bsok)\b/.test(norm)) deliveryDate = addDays(options.today, 1);
      return;
    }

    const { rest, packSize, qty } = extractSizeQty(norm);
    const exact = matchProduct(rest, candidates, catalog, false);
    const isItem = hasMarker || exact !== null || packSize !== null;

    if (!isItem) {
      const name = cleanCustomerName(raw);
      if (!name) {
        ignoredLines.push({ lineNo, raw });
        return;
      }
      startCustomer(name, CATEGORY_WORDS.test(norm));
      return;
    }

    const owner = current ?? startCustomer('', false);
    const match = exact ?? matchProduct(rest, candidates, catalog, true);
    const messages: string[] = [];
    let status: ParseStatus = 'OK';
    const line: ParsedLine = {
      lineNo,
      raw,
      productText: match?.matchedText ?? rest,
      productId: null,
      productName: null,
      categoryCode: 'FROZEN',
      packSize,
      qty,
      variantId: null,
      price: null,
      subtotal: 0,
      status,
      messages,
    };

    if (!match) {
      line.status = 'ERROR';
      messages.push(`Produk "${rest || raw}" tidak dikenali`);
      owner.lines.push(line);
      return;
    }
    const product = products.get(match.productId)!;
    line.productId = product.id;
    line.productName = product.name;
    if (match.kind === 'fuzzy') {
      status = 'WARN';
      messages.push(`"${match.matchedText}" dicocokkan ke ${product.name}`);
    }
    // Kategori dicek pada SISA teks setelah nama produk (bukan "goreng" di nama produk).
    const itemSiapMakan = CATEGORY_WORDS.test(match.residual);
    line.categoryCode = itemSiapMakan || owner.siapMakan ? 'SIAP_MAKAN' : 'FROZEN';

    const inCategory = product.variants
      .filter((v) => v.categoryCode === line.categoryCode)
      .sort((a, b) => a.packSize - b.packSize);
    if (inCategory.length === 0) {
      line.status = 'ERROR';
      messages.push(`${product.name} tidak tersedia untuk kategori ini`);
      owner.lines.push(line);
      return;
    }
    const variant =
      packSize === null ? inCategory[0] : inCategory.find((v) => v.packSize === packSize);
    if (packSize === null) {
      status = 'WARN';
      messages.push(`Ukuran tidak ditulis → isi ${variant!.packSize}`);
    }
    if (!variant) {
      line.status = 'ERROR';
      messages.push(`${product.name} isi ${packSize} tidak tersedia`);
      owner.lines.push(line);
      return;
    }
    line.variantId = variant.id;
    line.packSize = variant.packSize;
    line.price = variant.price;
    line.subtotal = variant.price * qty;
    line.status = status;
    owner.lines.push(line);
  });

  // Gabungkan pelanggan yang sama (nama ternormalisasi sama).
  const merged: ParsedCustomer[] = [];
  const byName = new Map<string, ParsedCustomer>();
  for (const c of customers) {
    const { siapMakan: _ignored, ...plain } = c as ParsedCustomer & { siapMakan?: boolean };
    const existing = c.nameNormalized ? byName.get(c.nameNormalized) : undefined;
    if (existing) {
      existing.lines.push(...plain.lines);
      existing.merged = true;
      continue;
    }
    if (c.nameNormalized) byName.set(c.nameNormalized, plain);
    merged.push(plain);
  }
  const result = merged.filter((c) => c.lines.length > 0);
  for (const c of result) {
    c.total = c.lines.reduce((sum, l) => sum + l.subtotal, 0);
    if (!c.name) {
      for (const l of c.lines) {
        if (l.status === 'OK') l.status = 'WARN';
        l.messages.push('Nama pelanggan tidak ditemukan');
      }
    }
  }
  const lines = result.flatMap((c) => c.lines);
  return {
    deliveryDate,
    headerDetected,
    customers: result,
    ignoredLines,
    totals: {
      orders: result.length,
      packs: lines.filter((l) => l.variantId).reduce((sum, l) => sum + l.qty, 0),
      amount: result.reduce((sum, c) => sum + c.total, 0),
    },
    hasErrors: lines.some((l) => l.status === 'ERROR'),
  };
}
