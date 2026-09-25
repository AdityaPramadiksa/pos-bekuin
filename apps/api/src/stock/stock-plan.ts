import { Prisma } from '@prisma/client';

type Decimal = Prisma.Decimal;
const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export type StockItemType = 'PRODUCT' | 'INGREDIENT';

export interface StockRow {
  itemType: StockItemType;
  id: string;
  name: string;
  unit: string; // pcs / g / ml
  qty: Decimal;
  avgCost: Decimal;
}

export interface StockChange {
  itemType: StockItemType;
  id: string;
  /** + masuk, − keluar */
  qty: Prisma.Decimal.Value;
  /** Biaya per unit barang masuk (dipakai untuk rata-rata tertimbang & mutasi). */
  unitCost?: Prisma.Decimal.Value;
}

export interface PlanOptions {
  allowNegativeProducts?: boolean;
  allowNegativeIngredients?: boolean;
  /** Perbarui biaya rata-rata tertimbang untuk barang masuk (stok masuk, produksi). */
  updateAverageCost?: boolean;
}

export interface PlannedChange {
  itemType: StockItemType;
  id: string;
  name: string;
  qtyChange: Decimal;
  balanceAfter: Decimal;
  unitCost: Decimal;
  newAvgCost: Decimal;
}

export interface Shortage {
  name: string;
  unit: string;
  need: number;
  available: number;
}

export const itemKey = (itemType: StockItemType, id: string) => `${itemType}:${id}`;

/** Gabungkan perubahan untuk item yang sama (misal kemasan saos dari beberapa varian). */
export function mergeChanges(changes: StockChange[]): StockChange[] {
  const merged = new Map<string, StockChange>();
  for (const change of changes) {
    const key = itemKey(change.itemType, change.id);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { ...change });
      continue;
    }
    // Rata-rata biaya masuk bila dua baris masuk untuk item yang sama.
    const prevQty = D(prev.qty);
    const addQty = D(change.qty);
    let unitCost = prev.unitCost ?? change.unitCost;
    if (
      prev.unitCost !== undefined &&
      change.unitCost !== undefined &&
      prevQty.plus(addQty).gt(0)
    ) {
      unitCost = prevQty
        .mul(prev.unitCost)
        .plus(addQty.mul(change.unitCost))
        .div(prevQty.plus(addQty));
    }
    merged.set(key, { ...prev, qty: prevQty.plus(addQty), unitCost });
  }
  return [...merged.values()].filter((c) => !D(c.qty).isZero());
}

/**
 * Hitung saldo baru tiap item. Fungsi murni: tidak menyentuh database.
 * Balikan shortages bila ada saldo yang jadi minus (dan tidak diizinkan).
 */
export function planStock(
  rows: Map<string, StockRow>,
  changes: StockChange[],
  options: PlanOptions = {},
): { planned: PlannedChange[]; shortages: Shortage[] } {
  const planned: PlannedChange[] = [];
  const shortages: Shortage[] = [];

  for (const change of mergeChanges(changes)) {
    const row = rows.get(itemKey(change.itemType, change.id));
    if (!row) throw new Error(`Item stok tidak ditemukan: ${change.itemType} ${change.id}`);

    const qtyChange = D(change.qty);
    if (row.itemType === 'PRODUCT' && !qtyChange.isInteger()) {
      throw new Error(`Stok produk ${row.name} harus bilangan bulat (pcs)`);
    }
    const balanceAfter = row.qty.plus(qtyChange);
    const allowNegative =
      row.itemType === 'PRODUCT' ? options.allowNegativeProducts : options.allowNegativeIngredients;
    if (balanceAfter.lt(0) && !allowNegative) {
      shortages.push({
        name: row.name,
        unit: row.unit,
        need: qtyChange.abs().toNumber(),
        available: Math.max(0, row.qty.toNumber()),
      });
      continue;
    }

    const incomingCost = change.unitCost !== undefined ? D(change.unitCost) : row.avgCost;
    let newAvgCost = row.avgCost;
    if (options.updateAverageCost && qtyChange.gt(0)) {
      const oldQty = Prisma.Decimal.max(row.qty, 0);
      // Stok lama tanpa biaya (misal stok awal tanpa harga) tidak boleh menarik rata-rata ke nol.
      newAvgCost =
        oldQty.isZero() || row.avgCost.isZero()
          ? incomingCost
          : oldQty.mul(row.avgCost).plus(qtyChange.mul(incomingCost)).div(oldQty.plus(qtyChange));
    }

    planned.push({
      itemType: row.itemType,
      id: row.id,
      name: row.name,
      qtyChange,
      balanceAfter,
      unitCost: qtyChange.gt(0) ? incomingCost : row.avgCost,
      newAvgCost: newAvgCost.toDecimalPlaces(4),
    });
  }
  return { planned, shortages };
}

export function formatShortages(shortages: Shortage[]): string {
  const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  return (
    'Stok tidak cukup: ' +
    shortages
      .map((s) => `${s.name} (butuh ${fmt(s.need)} ${s.unit}, sisa ${fmt(s.available)} ${s.unit})`)
      .join('; ')
  );
}
