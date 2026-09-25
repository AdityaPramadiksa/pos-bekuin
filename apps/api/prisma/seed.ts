/**
 * Seeder data awal Bekuin (PRD bagian 7). Aman dijalankan berulang (upsert).
 * Jalankan: pnpm db:seed
 */
import { PaymentType, PrismaClient, RecipeType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { INGREDIENTS, PACKAGING, PRODUCTS, SEMI_FINISHED, VARIANTS } from './seed-data';

const prisma = new PrismaClient();

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

  await seedDemoStock();

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

// ── Stok awal demo: hanya bila belum ada mutasi stok sama sekali ──
const DEMO_STOCK: Record<string, number> = {
  Ayam: 5000,
  'Putih telur': 10,
  Gula: 1000,
  'Bumbu adonan (paket)': 5,
  'Tepung tapioka': 2000,
  'Keju oles': 4000,
  'Kulit lumpia': 100,
  'Kulit dimsum': 200,
  'Tepung terigu': 2000,
  'Susu cair': 1000,
  Telur: 20,
  'Smoked beef': 50,
  Mayones: 1000,
  'Kental manis': 400,
  'Keju blok': 2000,
  'Tepung roti': 2000,
  'Plastik vacuum': 100,
  'Stiker logo': 100,
  Saos: 150,
  'Box siap makan': 100,
  'Minyak & gas': 100,
};
const DEMO_PRODUCT_PCS = 60;

async function seedDemoStock() {
  if (process.env.SEED_DEMO_STOCK === 'false') return;
  if ((await prisma.stockMovement.count()) > 0) return;
  const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  const note = 'Stok awal demo (seeder) — sesuaikan lewat Stok Opname';

  await prisma.$transaction(async (tx) => {
    for (const [name, qty] of Object.entries(DEMO_STOCK)) {
      const ing = await tx.ingredient.findUnique({ where: { name } });
      if (!ing) continue;
      const minStock = Math.round(qty * 0.2);
      await tx.ingredient.update({ where: { id: ing.id }, data: { stockQty: qty, minStock } });
      await tx.stockMovement.create({
        data: {
          itemType: 'INGREDIENT',
          ingredientId: ing.id,
          type: 'MANUAL_ADJUST',
          qtyChange: qty,
          balanceAfter: qty,
          unitCost: ing.avgCostPerUnit,
          refType: 'ADJUST',
          note,
          userId: admin.id,
        },
      });
    }
    for (const product of await tx.product.findMany()) {
      await tx.product.update({ where: { id: product.id }, data: { stockPcs: DEMO_PRODUCT_PCS } });
      await tx.stockMovement.create({
        data: {
          itemType: 'PRODUCT',
          productId: product.id,
          type: 'MANUAL_ADJUST',
          qtyChange: DEMO_PRODUCT_PCS,
          balanceAfter: DEMO_PRODUCT_PCS,
          unitCost: product.avgCostPerPcs,
          refType: 'ADJUST',
          note,
          userId: admin.id,
        },
      });
    }
  });
  console.log(`Stok awal demo dibuat: ${DEMO_PRODUCT_PCS} pcs per produk + bahan & kemasan`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
