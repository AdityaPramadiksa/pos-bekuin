/**
 * Data master Bekuin dari PRD bagian 7. Dipakai seeder dan unit test HPP
 * (angka harus cocok dengan tabel 7.2, 7.3, dan 7.5).
 */
import type { BaseUnit, IngredientType } from '@prisma/client';

// ── 7.1 Bahan baku: [nama, tipe, satuan dasar, kemasan beli, isi per kemasan, harga beli] ──
export const INGREDIENTS: [string, IngredientType, BaseUnit, string, number, number][] = [
  ['Ayam', 'RAW', 'GRAM', 'pack 1 kg', 1000, 60000],
  ['Putih telur', 'RAW', 'PCS', 'butir', 1, 2000],
  ['Gula', 'RAW', 'GRAM', 'pack 1 kg', 1000, 17000],
  ['Bumbu adonan (paket)', 'RAW', 'PCS', 'paket', 1, 7000],
  ['Tepung tapioka', 'RAW', 'GRAM', 'pack 1 kg', 1000, 15000],
  ['Keju oles', 'RAW', 'GRAM', 'pack 2 kg', 2000, 140000],
  ['Kulit lumpia', 'RAW', 'PCS', 'pack 50 lbr', 50, 12000],
  ['Kulit dimsum', 'RAW', 'PCS', 'pack 100 lbr', 100, 15000],
  ['Tepung terigu', 'RAW', 'GRAM', 'pack 1 kg', 1000, 10000],
  ['Susu cair', 'RAW', 'ML', 'kotak 1 L', 1000, 20000],
  ['Telur', 'RAW', 'PCS', 'butir', 1, 2000],
  ['Smoked beef', 'RAW', 'PCS', 'pack 50 slice', 50, 70000],
  ['Mayones', 'RAW', 'GRAM', 'pack 1 kg', 1000, 25000],
  ['Kental manis', 'RAW', 'GRAM', 'kaleng 400 g', 400, 20000],
  ['Keju blok', 'RAW', 'GRAM', 'blok 2 kg', 2000, 90000],
  ['Tepung roti', 'RAW', 'GRAM', 'pack 1 kg', 1000, 18000],
  ['Plastik vacuum', 'PACKAGING', 'PCS', 'pcs', 1, 1000],
  ['Stiker logo', 'PACKAGING', 'PCS', 'pcs', 1, 300],
  ['Saos', 'PACKAGING', 'PCS', 'sachet', 1, 2000],
  ['Box siap makan', 'PACKAGING', 'PCS', 'pcs', 1, 1000],
  ['Minyak & gas', 'PACKAGING', 'PCS', 'porsi goreng', 1, 1000],
];

// ── 7.2 Resep setengah jadi ──
export const SEMI_FINISHED = [
  {
    name: 'Adonan Dasar',
    unit: 'GRAM' as BaseUnit,
    yieldQty: 1200,
    lines: [
      ['Ayam', 1000],
      ['Putih telur', 1],
      ['Gula', 33],
      ['Bumbu adonan (paket)', 1],
      ['Tepung tapioka', 120],
    ] as [string, number][],
  },
  {
    name: 'Kulit Risol',
    unit: 'PCS' as BaseUnit,
    yieldQty: 50,
    note: 'Ditambah air 1.000 ml (tanpa biaya).',
    lines: [
      ['Tepung terigu', 500],
      ['Tepung tapioka', 120],
      ['Susu cair', 250],
      ['Telur', 2],
    ] as [string, number][],
  },
];

// ── 7.3 Resep produk per 1 pcs + alias parser ──
export const PRODUCTS = [
  {
    name: 'Dimsum Goreng Keju',
    sortOrder: 4,
    lines: [
      ['Kulit lumpia', 2],
      ['Adonan Dasar', 26],
      ['Keju oles', 10],
    ] as [string, number][],
    aliases: ['dimsum goreng keju', 'dimsam goreng keju', 'goreng keju'],
  },
  {
    name: 'Udang Keju',
    sortOrder: 1,
    lines: [
      ['Adonan Dasar', 25],
      ['Keju oles', 7],
      ['Tepung roti', 10],
    ] as [string, number][],
    aliases: ['udang keju', 'udang'],
  },
  {
    name: 'Risol Mayo',
    sortOrder: 5,
    lines: [
      ['Kulit Risol', 1],
      ['Telur', 0.125],
      ['Smoked beef', 0.2],
      ['Keju blok', 10],
      ['Mayones', 20],
      ['Kental manis', 0.2],
      ['Tepung roti', 10],
    ] as [string, number][],
    aliases: ['risol mayo', 'risol'],
  },
  {
    name: 'Dimsum Keju',
    sortOrder: 3,
    lines: [
      ['Kulit dimsum', 1],
      ['Adonan Dasar', 25],
      ['Keju oles', 5],
    ] as [string, number][],
    aliases: ['dimsum keju', 'dimsam keju'],
  },
  {
    name: 'Dimsum Ori',
    sortOrder: 2,
    lines: [
      ['Kulit dimsum', 1],
      ['Adonan Dasar', 27],
    ] as [string, number][],
    aliases: ['dimsum ori', 'dimsam ori', 'dimsum original', 'ori'],
  },
];

// ── 7.5 Varian: [produk, kategori, pack, harga] ──
export const VARIANTS: [string, 'FROZEN' | 'SIAP_MAKAN', number, number][] = [
  ['Udang Keju', 'FROZEN', 6, 22000],
  ['Udang Keju', 'FROZEN', 9, 33000],
  ['Udang Keju', 'SIAP_MAKAN', 6, 24000],
  ['Udang Keju', 'SIAP_MAKAN', 9, 35000],
  ['Dimsum Ori', 'FROZEN', 6, 20000],
  ['Dimsum Ori', 'FROZEN', 9, 30000],
  ['Dimsum Ori', 'SIAP_MAKAN', 6, 21000],
  ['Dimsum Ori', 'SIAP_MAKAN', 9, 31000],
  ['Dimsum Keju', 'FROZEN', 6, 22000],
  ['Dimsum Keju', 'FROZEN', 9, 33000],
  ['Dimsum Keju', 'SIAP_MAKAN', 6, 23000],
  ['Dimsum Keju', 'SIAP_MAKAN', 9, 34000],
  ['Dimsum Goreng Keju', 'FROZEN', 6, 28000],
  ['Dimsum Goreng Keju', 'SIAP_MAKAN', 6, 30000],
  ['Risol Mayo', 'FROZEN', 6, 28000],
  ['Risol Mayo', 'SIAP_MAKAN', 6, 30000],
];

// ── 7.4 Kemasan per pack ──
export const PACKAGING: Record<'FROZEN' | 'SIAP_MAKAN', [string, number][]> = {
  FROZEN: [
    ['Plastik vacuum', 1],
    ['Stiker logo', 1],
    ['Saos', 1],
  ],
  SIAP_MAKAN: [
    ['Box siap makan', 1],
    ['Minyak & gas', 1],
    ['Saos', 1],
  ],
};
