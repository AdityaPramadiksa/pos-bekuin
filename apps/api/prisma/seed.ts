/**
 * Seeder data awal Bekuin (PRD bagian 7). Aman dijalankan berulang (upsert).
 * Jalankan: pnpm db:seed
 */
import { BaseUnit, IngredientType, PaymentType, PrismaClient, RecipeType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

// ── 7.1 Bahan baku: [nama, tipe, satuan dasar, kemasan beli, isi per kemasan, harga beli] ──
const INGREDIENTS: [string, IngredientType, BaseUnit, string, number, number][] = [
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
const SEMI_FINISHED = [
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
const PRODUCTS = [
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
const VARIANTS: [string, 'FROZEN' | 'SIAP_MAKAN', number, number][] = [
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
const PACKAGING: Record<'FROZEN' | 'SIAP_MAKAN', [string, number][]> = {
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

const EXPENSE_CATEGORIES = [
  'Sewa',
  'Listrik & Air',
  'Gaji',
  'Gas',
  'Transport & Ongkir',
  'Marketing',
  'Lain-lain',
];

function qrToken() {
  return randomBytes(9).toString('base64url'); // 12 karakter, sulit ditebak
}

async function main() {
  // ── Akun ──
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';
  const staffPassword = process.env.SEED_STAFF_PASSWORD ?? 'staff12345';
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      name: 'Admin Bekuin',
      username: 'admin',
      role: 'ADMIN',
      passwordHash: await bcrypt.hash(adminPassword, 10),
    },
  });
  await prisma.user.upsert({
    where: { username: 'staff' },
    update: {},
    create: {
      name: 'Staff Bekuin',
      username: 'staff',
      role: 'STAFF',
      passwordHash: await bcrypt.hash(staffPassword, 10),
    },
  });

  // ── Toko, metode bayar, kategori ──
  await prisma.setting.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      phone: '085743635709',
      receiptFooter: 'Terima kasih sudah order!\nSimpan frozen di freezer -18C',
    },
  });

  const paymentMethods: [string, PaymentType, boolean][] = [
    ['Cash', 'CASH', false],
    ['Transfer', 'TRANSFER', false],
    ['QRIS', 'QRIS', true],
  ];
  for (const [i, [name, type, showToCustomer]] of paymentMethods.entries()) {
    await prisma.paymentMethod.upsert({
      where: { name },
      update: {},
      create: { name, type, showToCustomer, sortOrder: i },
    });
  }

  const categories = {
    FROZEN: await prisma.salesCategory.upsert({
      where: { code: 'FROZEN' },
      update: {},
      create: { code: 'FROZEN', name: 'Frozen', sortOrder: 0 },
    }),
    SIAP_MAKAN: await prisma.salesCategory.upsert({
      where: { code: 'SIAP_MAKAN' },
      update: {},
      create: { code: 'SIAP_MAKAN', name: 'Siap Makan', sortOrder: 1 },
    }),
  };

  for (const [i, name] of EXPENSE_CATEGORIES.entries()) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: i },
    });
  }

  // ── Meja QR ──
  const tables = [
    ...Array.from({ length: 6 }, (_, i) => ({
      code: `M${String(i + 1).padStart(2, '0')}`,
      name: `Meja ${i + 1}`,
    })),
    { code: 'TAKEAWAY', name: 'Kasir / Bawa Pulang' },
  ];
  for (const [i, t] of tables.entries()) {
    await prisma.diningTable.upsert({
      where: { code: t.code },
      update: {},
      create: { ...t, qrToken: qrToken(), sortOrder: i },
    });
  }

  // ── Bahan baku ──
  const ing = new Map<string, string>();
  for (const [name, type, baseUnit, purchaseUnit, purchaseQty, lastPrice] of INGREDIENTS) {
    const row = await prisma.ingredient.upsert({
      where: { name },
      update: {},
      create: {
        name,
        type,
        baseUnit,
        purchaseUnit,
        purchaseQty,
        lastPrice,
        avgCostPerUnit: lastPrice / purchaseQty,
      },
    });
    ing.set(name, row.id);
  }

  // ── Resep setengah jadi (biaya per unit dihitung dari resep) ──
  for (const r of SEMI_FINISHED) {
    const batchCost = r.lines.reduce((sum, [name, qty]) => {
      const [, , , , purchaseQty, price] = INGREDIENTS.find((x) => x[0] === name)!;
      return sum + qty * (price / purchaseQty);
    }, 0);
    const output = await prisma.ingredient.upsert({
      where: { name: r.name },
      update: {},
      create: {
        name: r.name,
        type: 'SEMI_FINISHED',
        baseUnit: r.unit,
        purchaseQty: r.yieldQty,
        avgCostPerUnit: batchCost / r.yieldQty,
      },
    });
    ing.set(r.name, output.id);

    const existing = await prisma.recipe.findUnique({ where: { outputIngredientId: output.id } });
    if (!existing) {
      await prisma.recipe.create({
        data: {
          name: r.name,
          type: RecipeType.SEMI_FINISHED,
          yieldQty: r.yieldQty,
          outputIngredientId: output.id,
          note: 'note' in r ? r.note : undefined,
          lines: { create: r.lines.map(([name, qty]) => ({ ingredientId: ing.get(name)!, qty })) },
        },
      });
    }
  }

  // ── Produk, resep produk, alias ──
  const prod = new Map<string, string>();
  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { name: p.name },
      update: {},
      create: { name: p.name, sortOrder: p.sortOrder, minStockPcs: 30 },
    });
    prod.set(p.name, product.id);

    const existing = await prisma.recipe.findUnique({ where: { productId: product.id } });
    if (!existing) {
      await prisma.recipe.create({
        data: {
          name: `Resep ${p.name}`,
          type: RecipeType.PRODUCT,
          yieldQty: 1,
          productId: product.id,
          lines: { create: p.lines.map(([name, qty]) => ({ ingredientId: ing.get(name)!, qty })) },
        },
      });
    }
    for (const alias of p.aliases) {
      await prisma.productAlias.upsert({
        where: { alias },
        update: {},
        create: { alias, productId: product.id },
      });
    }
  }

  // ── Varian + kemasan ──
  for (const [i, [productName, categoryCode, packSize, price]] of VARIANTS.entries()) {
    const productId = prod.get(productName)!;
    const categoryId = categories[categoryCode].id;
    const variant = await prisma.productVariant.upsert({
      where: { productId_categoryId_packSize: { productId, categoryId, packSize } },
      update: {},
      create: { productId, categoryId, packSize, price, sortOrder: i },
    });
    for (const [name, qty] of PACKAGING[categoryCode]) {
      await prisma.variantPackaging.upsert({
        where: { variantId_ingredientId: { variantId: variant.id, ingredientId: ing.get(name)! } },
        update: {},
        create: { variantId: variant.id, ingredientId: ing.get(name)!, qty },
      });
    }
  }

  const counts = {
    users: await prisma.user.count(),
    ingredients: await prisma.ingredient.count(),
    recipes: await prisma.recipe.count(),
    products: await prisma.product.count(),
    variants: await prisma.productVariant.count(),
    tables: await prisma.diningTable.count(),
  };
  console.log('Seeder selesai:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
