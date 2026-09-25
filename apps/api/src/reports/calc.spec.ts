import {
  allocateDiscount,
  avgMinutes,
  eachDay,
  expectedCash,
  groupOrders,
  pct,
  productProfit,
  profitLossLine,
  salesByDay,
  salesByHour,
  summarizeSales,
  type CalcOrder,
} from './calc';

let seq = 0;
function order(partial: Partial<CalcOrder>): CalcOrder {
  seq += 1;
  return {
    id: `o${seq}`,
    status: 'PAID',
    source: 'POS',
    subtotal: 42000,
    discount: 0,
    total: 42000,
    hppTotal: 26000,
    // 25 Sep 2026 10:15 WITA
    approvedAt: new Date('2026-09-25T02:15:00Z'),
    createdAt: new Date('2026-09-25T02:10:00Z'),
    paymentMethodId: 'cash',
    paymentMethodName: 'Cash',
    paymentType: 'CASH',
    staffName: 'Sari',
    items: [
      {
        productId: 'udang',
        productName: 'Udang Keju',
        categoryCode: 'FROZEN',
        packSize: 6,
        qty: 1,
        subtotal: 22000,
        hppPerPack: 16260,
      },
      {
        productId: 'ori',
        productName: 'Dimsum Ori',
        categoryCode: 'FROZEN',
        packSize: 6,
        qty: 1,
        subtotal: 20000,
        hppPerPack: 9740,
      },
    ],
    ...partial,
  };
}

describe('summarizeSales', () => {
  it('omzet hanya dari PAID; void/reject/batal dihitung terpisah', () => {
    const orders = [
      order({}),
      order({ subtotal: 30000, discount: 2000, total: 28000, hppTotal: 15000 }),
      order({ status: 'VOIDED', total: 50000 }),
      order({ status: 'REJECTED', total: 33000, approvedAt: null }),
      order({ status: 'CANCELLED', total: 20000, approvedAt: null }),
    ];
    const { summary, excluded } = summarizeSales(orders);
    expect(summary).toEqual({
      orders: 2,
      grossSales: 72000,
      discount: 2000,
      netSales: 70000,
      avgOrder: 35000,
      hpp: 41000,
      grossProfit: 29000,
    });
    expect(excluded).toEqual({
      voided: { count: 1, amount: 50000 },
      rejected: { count: 1, amount: 33000 },
      cancelled: { count: 1, amount: 20000 },
    });
  });

  it('tanpa order: rata-rata 0, bukan NaN', () => {
    expect(summarizeSales([]).summary.avgOrder).toBe(0);
  });
});

describe('profitLossLine', () => {
  it('laba bersih = laba kotor − pengeluaran − waste', () => {
    expect(
      profitLossLine('2026-09', {
        netSales: 1_000_000,
        hpp: 600_000,
        expenses: 150_000,
        waste: 20_000,
      }),
    ).toEqual({
      period: '2026-09',
      netSales: 1_000_000,
      hpp: 600_000,
      grossProfit: 400_000,
      expenses: 150_000,
      waste: 20_000,
      netProfit: 230_000,
    });
  });

  it('boleh rugi (laba bersih negatif)', () => {
    expect(
      profitLossLine('x', { netSales: 100_000, hpp: 60_000, expenses: 80_000, waste: 0 }).netProfit,
    ).toBe(-40_000);
  });
});

describe('allocateDiscount', () => {
  it('proporsional dan jumlahnya tepat sama dengan diskon', () => {
    const shares = allocateDiscount([22000, 20000, 31000], 5000);
    expect(shares.reduce((s, n) => s + n, 0)).toBe(5000);
    expect(shares).toEqual([1507, 1370, 2123]);
  });

  it('tanpa diskon → semua 0', () => {
    expect(allocateDiscount([1000, 2000], 0)).toEqual([0, 0]);
  });
});

describe('productProfit', () => {
  it('omzet item dikurangi bagian diskon, HPP dari snapshot, void tidak dihitung', () => {
    const r = productProfit([order({ discount: 4200, total: 37800 }), order({ status: 'VOIDED' })]);
    const udang = r.byProduct.find((p) => p.productId === 'udang')!;
    expect(udang).toMatchObject({ packs: 1, pcs: 6, revenue: 19800, hpp: 16260, profit: 3540 });
    expect(r.byCategory).toHaveLength(1);
    expect(r.byCategory[0]).toMatchObject({ revenue: 37800, hpp: 26000, profit: 11800 });
    expect(r.byCategory[0].marginPct).toBe(31.2);
  });
});

describe('pengelompokan & waktu', () => {
  it('per metode bayar, urut nominal terbesar', () => {
    const rows = groupOrders(
      [
        order({}),
        order({ paymentMethodId: 'qris', paymentMethodName: 'QRIS', total: 90000 }),
        order({ status: 'VOIDED', paymentMethodId: 'qris', paymentMethodName: 'QRIS' }),
      ],
      (o) => o.paymentMethodId ?? '-',
      (o) => o.paymentMethodName ?? '-',
    );
    expect(rows).toEqual([
      { key: 'qris', label: 'QRIS', count: 1, amount: 90000 },
      { key: 'cash', label: 'Cash', count: 1, amount: 42000 },
    ]);
  });

  it('per hari memakai tanggal WITA dan mengisi hari kosong', () => {
    const days = salesByDay(
      [
        // 24 Sep 23:30 WITA
        order({ approvedAt: new Date('2026-09-24T15:30:00Z') }),
        // 25 Sep 00:30 WITA (masih 24 Sep di UTC)
        order({ approvedAt: new Date('2026-09-24T16:30:00Z') }),
      ],
      '2026-09-24',
      '2026-09-26',
    );
    expect(days.map((d) => [d.date, d.orders])).toEqual([
      ['2026-09-24', 1],
      ['2026-09-25', 1],
      ['2026-09-26', 0],
    ]);
  });

  it('jam ramai memakai jam WITA', () => {
    const hours = salesByHour([order({})]);
    expect(hours[10]).toEqual({ hour: 10, count: 1, amount: 42000 });
  });

  it('eachDay inklusif, pct 1 desimal', () => {
    expect(eachDay('2026-09-29', '2026-10-01')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(5, 0)).toBe(0);
  });
});

describe('shift kasir', () => {
  it('kas seharusnya = modal + penjualan cash − pengeluaran cash', () => {
    expect(expectedCash(200_000, 450_000, 35_000)).toBe(615_000);
  });

  it('rata-rata menit mengabaikan pasangan yang belum lengkap', () => {
    const t = (m: number) => new Date(Date.UTC(2026, 8, 25, 2, m));
    expect(
      avgMinutes([
        [t(0), t(10)],
        [t(0), t(5)],
        [t(0), null],
      ]),
    ).toBe(7.5);
    expect(avgMinutes([[null, t(1)]])).toBeNull();
  });
});
