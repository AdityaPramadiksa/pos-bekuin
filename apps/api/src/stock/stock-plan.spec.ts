import { Prisma } from '@prisma/client';
import { formatShortages, itemKey, mergeChanges, planStock, type StockRow } from './stock-plan';

const D = (v: number) => new Prisma.Decimal(v);
function rows(...list: StockRow[]) {
  return new Map(list.map((r) => [itemKey(r.itemType, r.id), r]));
}
const udang: StockRow = {
  itemType: 'PRODUCT',
  id: 'p1',
  name: 'Udang Keju',
  unit: 'pcs',
  qty: D(42),
  avgCost: D(2156.69),
};
const saos: StockRow = {
  itemType: 'INGREDIENT',
  id: 'i1',
  name: 'Saos',
  unit: 'pcs',
  qty: D(5),
  avgCost: D(2000),
};
const keju: StockRow = {
  itemType: 'INGREDIENT',
  id: 'i2',
  name: 'Keju oles',
  unit: 'g',
  qty: D(1000),
  avgCost: D(70),
};

describe('planStock', () => {
  it('mengurangi stok dan mencatat saldo akhir', () => {
    const { planned, shortages } = planStock(rows(udang), [
      { itemType: 'PRODUCT', id: 'p1', qty: -12 },
    ]);
    expect(shortages).toEqual([]);
    expect(planned[0].balanceAfter.toNumber()).toBe(30);
    expect(planned[0].unitCost.toNumber()).toBe(2156.69);
  });

  it('menggabungkan pemotongan item yang sama sebelum dicek', () => {
    // 3 varian masing-masing butuh 2 saos → 6 > 5
    const { shortages } = planStock(rows(saos), [
      { itemType: 'INGREDIENT', id: 'i1', qty: -2 },
      { itemType: 'INGREDIENT', id: 'i1', qty: -2 },
      { itemType: 'INGREDIENT', id: 'i1', qty: -2 },
    ]);
    expect(shortages).toEqual([{ name: 'Saos', unit: 'pcs', need: 6, available: 5 }]);
  });

  it('tidak pernah membuat stok minus kecuali diizinkan', () => {
    const change = [{ itemType: 'PRODUCT' as const, id: 'p1', qty: -50 }];
    expect(planStock(rows(udang), change).shortages).toHaveLength(1);
    const allowed = planStock(rows(udang), change, { allowNegativeProducts: true });
    expect(allowed.shortages).toHaveLength(0);
    expect(allowed.planned[0].balanceAfter.toNumber()).toBe(-8);
  });

  it('menolak pcs pecahan untuk produk', () => {
    expect(() => planStock(rows(udang), [{ itemType: 'PRODUCT', id: 'p1', qty: 1.5 }])).toThrow(
      /bilangan bulat/,
    );
  });

  it('menghitung rata-rata tertimbang saat barang masuk', () => {
    // stok 1.000 g @70, masuk 4.000 g @75 → (70.000 + 300.000) / 5.000 = 74
    const { planned } = planStock(
      rows(keju),
      [{ itemType: 'INGREDIENT', id: 'i2', qty: 4000, unitCost: 75 }],
      {
        updateAverageCost: true,
      },
    );
    expect(planned[0].newAvgCost.toNumber()).toBe(74);
    expect(planned[0].balanceAfter.toNumber()).toBe(5000);
    expect(planned[0].unitCost.toNumber()).toBe(75);
  });

  it('memakai biaya masuk bila stok lama nol atau minus', () => {
    const kosong = { ...keju, qty: D(-10) };
    const { planned } = planStock(
      rows(kosong),
      [{ itemType: 'INGREDIENT', id: 'i2', qty: 100, unitCost: 80 }],
      {
        updateAverageCost: true,
      },
    );
    expect(planned[0].newAvgCost.toNumber()).toBe(80);
  });

  it('mengabaikan perubahan nol dan membuat pesan kekurangan yang jelas', () => {
    expect(
      mergeChanges([
        { itemType: 'PRODUCT', id: 'p1', qty: 3 },
        { itemType: 'PRODUCT', id: 'p1', qty: -3 },
      ]),
    ).toEqual([]);
    expect(formatShortages([{ name: 'Udang Keju', unit: 'pcs', need: 12, available: 6 }])).toBe(
      'Stok tidak cukup: Udang Keju (butuh 12 pcs, sisa 6 pcs)',
    );
  });
});
