import type { ImportCatalog } from '@bekuin/shared';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PRODUCTS, VARIANTS } from '../../prisma/seed-data';
import { levenshtein, normalizeText, parseOrderText } from './parser';

/** Katalog dari data seeder (id = nama produk, id varian = produk|kategori|pack). */
const catalog: ImportCatalog = {
  products: PRODUCTS.map((p) => ({
    id: p.name,
    name: p.name,
    variants: VARIANTS.filter(([name]) => name === p.name).map(
      ([name, categoryCode, packSize, price]) => ({
        id: `${name}|${categoryCode}|${packSize}`,
        categoryCode,
        packSize,
        price,
      }),
    ),
  })),
  aliases: PRODUCTS.flatMap((p) => p.aliases.map((alias) => ({ alias, productId: p.name }))),
};
const TODAY = '2026-09-25';
const parse = (text: string) => parseOrderText(text, catalog, { today: TODAY });

describe('parseOrderText — fixture docs/fixtures (12 pelanggan)', () => {
  const fixtures = path.resolve(__dirname, '../../../../docs/fixtures');
  const sample = readFileSync(path.join(fixtures, 'wa-order-sample.txt'), 'utf8');
  const expected = JSON.parse(
    readFileSync(path.join(fixtures, 'wa-order-expected.json'), 'utf8'),
  ) as {
    deliveryOffsetDays: number;
    totals: { orders: number; packs: number; amount: number };
    orders: { customerName: string; merged?: boolean; items: [string, string, number, number][] }[];
  };
  const result = parse(sample);

  it('12 order, 21 pack, Rp510.000, tanggal kirim besok', () => {
    expect(result.totals).toEqual(expected.totals);
    expect(result.deliveryDate).toBe('2026-09-26');
    expect(result.headerDetected).toBe(true);
    expect(result.hasErrors).toBe(false);
  });

  it('isi setiap order sesuai expected (item digabung per varian)', () => {
    const actual = result.customers.map((c) => {
      const items = new Map<string, number>();
      for (const l of c.lines) {
        const key = `${l.productName}|${l.categoryCode}|${l.packSize}`;
        items.set(key, (items.get(key) ?? 0) + l.qty);
      }
      return {
        customerName: c.name,
        merged: c.merged,
        items: [...items]
          .map(([k, qty]) => [...k.split('|').map((v, i) => (i === 2 ? Number(v) : v)), qty])
          .sort(),
      };
    });
    const want = expected.orders.map((o) => ({
      customerName: o.customerName,
      merged: !!o.merged,
      items: [...o.items].sort(),
    }));
    expect(actual).toEqual(want);
  });

  it('semua item Mahayuda Siap Makan, termasuk "Dimsum goreng keju"', () => {
    const mahayuda = result.customers.find((c) => c.name === 'Mahayuda')!;
    expect(mahayuda.lines.map((l) => l.categoryCode)).toEqual([
      'SIAP_MAKAN',
      'SIAP_MAKAN',
      'SIAP_MAKAN',
    ]);
  });

  it('menandai baris fuzzy dan ukuran tebakan sebagai kuning', () => {
    const kusuma = result.customers.find((c) => c.name === 'Bu Kusuma')!;
    expect(kusuma.lines[0]).toMatchObject({
      productName: 'Udang Keju',
      status: 'WARN',
      productText: 'udng keju',
    });
    expect(kusuma.lines[1]).toMatchObject({ productName: 'Dimsum Ori', status: 'OK' }); // alias persis "dimsam ori"
    const dewi = result.customers.find((c) => c.name === 'Bu Dewi')!;
    expect(dewi.lines[0]).toMatchObject({ productName: 'Udang Keju', packSize: 6, status: 'WARN' });
  });
});

describe('parseOrderText — aturan', () => {
  it('"goreng" di nama produk bukan penanda Siap Makan; kata kategori di baris item hanya untuk item itu', () => {
    const r = parse(
      'Bu Ani\n. Dimsum goreng keju 6pcs\n. Udang keju 6 pcs mateng\n. dimsum ori 6 pcs',
    );
    expect(r.customers[0].lines.map((l) => [l.productName, l.categoryCode])).toEqual([
      ['Dimsum Goreng Keju', 'FROZEN'],
      ['Udang Keju', 'SIAP_MAKAN'],
      ['Dimsum Ori', 'FROZEN'],
    ]);
  });

  it('ukuran tidak tersedia & produk tak dikenal = merah', () => {
    const r = parse('Bu Ani\n- risol 9 pcs\n- bakso urat 6 pcs');
    expect(r.customers[0].lines.map((l) => l.status)).toEqual(['ERROR', 'ERROR']);
    expect(r.customers[0].lines[0].messages[0]).toMatch(/isi 9 tidak tersedia/);
    expect(r.customers[0].lines[1].messages[0]).toMatch(/tidak dikenali/);
    expect(r.hasErrors).toBe(true);
  });

  it('jumlah pack: 2x, x2, 2 x', () => {
    const r = parse('Bu Ani\n- udang keju 6pcs 2x\n- dimsum ori 6pcs x3\n- dimsum keju 6 pcs 4 x');
    expect(r.customers[0].lines.map((l) => l.qty)).toEqual([2, 3, 4]);
    expect(r.totals.packs).toBe(9);
  });

  it('header lusa, baris tanpa penanda tapi berisi produk tetap item', () => {
    const r = parse('Pesanan lusa ya kak\nPak Budi:\nudang keju 9 pcs');
    expect(r.deliveryDate).toBe('2026-09-27');
    expect(r.customers[0]).toMatchObject({ name: 'Pak Budi' });
    expect(r.customers[0].lines[0]).toMatchObject({
      productName: 'Udang Keju',
      packSize: 9,
      status: 'OK',
    });
  });

  it('item sebelum nama pelanggan tetap dibaca, ditandai kuning', () => {
    const r = parse('- udang keju 6pcs');
    expect(r.customers[0]).toMatchObject({ name: '' });
    expect(r.customers[0].lines[0].status).toBe('WARN');
  });

  it('normalisasi & jarak edit', () => {
    expect(normalizeText('Udang Keju 6PSC 🙏  x2')).toBe('udang keju 6 pcs x2');
    expect(levenshtein('dimsom ori', 'dimsum ori')).toBe(1);
    expect(levenshtein('udang', 'udang')).toBe(0);
  });
});
