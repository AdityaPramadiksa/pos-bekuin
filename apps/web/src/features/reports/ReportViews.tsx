import {
  formatRupiah,
  MOVEMENT_LABEL,
  type CashflowReport,
  type DailyClosingReport,
  type MovementType,
  type ProductProfitReport,
  type ProductProfitRow,
  type ProfitLossReport,
  type QrServiceReport,
  type SalesReport,
  type StockMovementReport,
  type TopProductsReport,
  type CashSessionView,
} from '@bekuin/shared';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { BarList } from '@/components/charts/BarList';
import { ColumnChart, type ChartPoint } from '@/components/charts/ColumnChart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { ShiftPrintDialog } from '@/features/finance/ShiftTab';
import { closingLines } from '@/features/finance/print';
import { PrintPreview } from '@/features/finance/PrintPreview';
import { fmtQty, formatDateKey, formatDateTime } from '@/features/orders/order-format';
import { useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { Card, StatementRow, StatTile } from './report-ui';

const pctText = (n: number) => `${n.toLocaleString('id-ID')}%`;
const minutes = (n: number | null) =>
  n === null ? '—' : `${n.toLocaleString('id-ID', { maximumFractionDigits: 1 })} mnt`;
/** Label sumbu tanggal: "25" atau "1/10" di awal bulan. */
const dayLabel = (key: string) => {
  const [, m, d] = key.split('-').map(Number);
  return d === 1 ? `${d}/${m}` : String(d);
};

function dayPoints(
  rows: { date: string; value: number; details?: ChartPoint['details'] }[],
): ChartPoint[] {
  return rows.map((r) => ({
    key: r.date,
    label: dayLabel(r.date),
    title: formatDateKey(r.date),
    value: r.value,
    details: r.details,
  }));
}

// ─────────────────────────────── Penjualan ───────────────────────────────

export function SalesView({ d }: { d: SalesReport }) {
  const s = d.summary;
  const activeHours = d.byHour.filter((h) => h.count > 0).map((h) => h.hour);
  const hours = activeHours.length
    ? d.byHour.slice(Math.min(...activeHours), Math.max(...activeHours) + 1)
    : [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile
          label="Omzet bersih"
          value={formatRupiah(s.netSales)}
          sub={`${s.orders} order disetujui`}
        />
        <StatTile
          label="Laba kotor"
          value={formatRupiah(s.grossProfit)}
          sub={`HPP ${formatRupiah(s.hpp)}`}
        />
        <StatTile label="Rata-rata / order" value={formatRupiah(s.avgOrder)} />
        <StatTile
          label="Diskon"
          value={formatRupiah(s.discount)}
          sub={`Omzet kotor ${formatRupiah(s.grossSales)}`}
        />
      </div>
      <p className="px-1 text-xs text-stone-500">
        Tidak dihitung omzet: void {d.excluded.voided.count} (
        {formatRupiah(d.excluded.voided.amount)}) · ditolak {d.excluded.rejected.count} · dibatalkan{' '}
        {d.excluded.cancelled.count}
      </p>
      {d.byDay.length > 1 && (
        <Card title="Omzet bersih per hari">
          <ColumnChart
            ariaLabel="Grafik omzet bersih per hari"
            format={formatRupiah}
            data={dayPoints(
              d.byDay.map((r) => ({
                date: r.date,
                value: r.netSales,
                details: [
                  { label: 'order', value: String(r.orders) },
                  { label: 'laba kotor', value: formatRupiah(r.grossProfit) },
                ],
              })),
            )}
          />
        </Card>
      )}
      <Card title="Jam ramai (WITA)">
        {hours.length === 0 ? (
          <p className="text-sm text-stone-500">Belum ada penjualan.</p>
        ) : (
          <ColumnChart
            ariaLabel="Grafik omzet per jam"
            format={formatRupiah}
            labelLast={false}
            data={hours.map((h) => ({
              key: String(h.hour),
              label: String(h.hour).padStart(2, '0'),
              title: `Jam ${String(h.hour).padStart(2, '0')}.00–${String(h.hour).padStart(2, '0')}.59`,
              value: h.amount,
              details: [{ label: 'order', value: String(h.count) }],
            }))}
          />
        )}
      </Card>
      <div className="grid gap-3 md:grid-cols-3">
        {(
          [
            ['Per metode bayar', d.byMethod],
            ['Per sumber order', d.bySource],
            ['Per staff', d.byStaff],
          ] as const
        ).map(([title, rows]) => (
          <Card key={title} title={title}>
            <BarList
              format={formatRupiah}
              rows={rows.map((r) => ({
                key: r.key,
                label: r.label,
                value: r.amount,
                sub: `${r.count} order`,
              }))}
            />
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────── Laba rugi ───────────────────────────────

export function ProfitLossView({ d }: { d: ProfitLossReport }) {
  const t = d.total;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Laba bersih"
          value={formatRupiah(t.netProfit)}
          sub={`Margin ${pctText(t.netMarginPct)}`}
          tone={t.netProfit < 0 ? 'bad' : undefined}
        />
        <StatTile
          label="Laba kotor"
          value={formatRupiah(t.grossProfit)}
          sub={`Margin ${pctText(t.grossMarginPct)}`}
        />
      </div>
      <Card title="Laba rugi">
        <StatementRow label="Omzet bersih" value={formatRupiah(t.netSales)} />
        <StatementRow label="− HPP (snapshot saat approve)" value={formatRupiah(t.hpp)} />
        <StatementRow label="Laba kotor" value={formatRupiah(t.grossProfit)} strong />
        <StatementRow label="− Pengeluaran operasional" value={formatRupiah(t.expenses)} />
        <StatementRow label="− Waste (barang rusak/basi)" value={formatRupiah(t.waste)} />
        <StatementRow label="Laba bersih" value={formatRupiah(t.netProfit)} strong />
      </Card>
      {d.byMonth.length > 1 && (
        <Card title="Per bulan">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1 font-medium">Bulan</th>
                  <th className="py-1 text-right font-medium">Omzet</th>
                  <th className="py-1 text-right font-medium">Laba kotor</th>
                  <th className="py-1 text-right font-medium">Pengeluaran</th>
                  <th className="py-1 text-right font-medium">Waste</th>
                  <th className="py-1 text-right font-medium">Laba bersih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 tabular-nums">
                {d.byMonth.map((m) => (
                  <tr key={m.period}>
                    <td className="py-1.5">{m.period}</td>
                    <td className="text-right">{formatRupiah(m.netSales)}</td>
                    <td className="text-right">{formatRupiah(m.grossProfit)}</td>
                    <td className="text-right">{formatRupiah(m.expenses)}</td>
                    <td className="text-right">{formatRupiah(m.waste)}</td>
                    <td className="text-right font-semibold">{formatRupiah(m.netProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card title="Pengeluaran per kategori">
        <BarList
          format={formatRupiah}
          empty="Belum ada pengeluaran di periode ini."
          rows={d.expensesByCategory.map((e) => ({
            key: e.key,
            label: e.label,
            value: e.amount,
            sub: `${e.count}×`,
          }))}
        />
      </Card>
    </div>
  );
}

// ─────────────────────────────── Produk ───────────────────────────────

function ProductTable({ rows }: { rows: ProductProfitRow[] }) {
  if (rows.length === 0) return <EmptyState title="Belum ada penjualan di periode ini" />;
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="w-full min-w-[34rem] text-sm">
        <thead className="text-left text-xs text-stone-500">
          <tr>
            <th className="px-3 py-2 font-medium">Produk</th>
            <th className="px-2 py-2 text-right font-medium">Pack</th>
            <th className="px-2 py-2 text-right font-medium">Omzet</th>
            <th className="px-2 py-2 text-right font-medium">HPP</th>
            <th className="px-2 py-2 text-right font-medium">Laba</th>
            <th className="px-3 py-2 text-right font-medium">Margin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100 tabular-nums">
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="px-3 py-2">{r.productName}</td>
              <td className="px-2 text-right">{r.packs}</td>
              <td className="px-2 text-right">{formatRupiah(r.revenue)}</td>
              <td className="px-2 text-right">{formatRupiah(r.hpp)}</td>
              <td className="px-2 text-right font-semibold">{formatRupiah(r.profit)}</td>
              <td className="px-3 text-right">{pctText(r.marginPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProductProfitView({ d }: { d: ProductProfitReport }) {
  const [by, setBy] = useState<'byProduct' | 'byVariant' | 'byCategory'>('byProduct');
  return (
    <div className="space-y-3">
      <Chips
        value={by}
        onChange={(k) => setBy(k as typeof by)}
        options={[
          { key: 'byProduct', label: 'Per produk' },
          { key: 'byVariant', label: 'Per varian' },
          { key: 'byCategory', label: 'Frozen vs Siap Makan' },
        ]}
      />
      <ProductTable rows={d[by]} />
      <p className="px-1 text-xs text-stone-500">
        Omzet per item sudah dikurangi bagian diskon order secara proporsional.
      </p>
    </div>
  );
}

export function TopProductsView({ d }: { d: TopProductsReport }) {
  const [sort, setSort] = useState<'revenue' | 'packs' | 'pcs'>('revenue');
  const rows = [...d.rows].sort((a, b) => b[sort] - a[sort]);
  const fmt =
    sort === 'revenue' ? formatRupiah : (n: number) => `${n} ${sort === 'packs' ? 'pack' : 'pcs'}`;
  return (
    <Card
      title="Produk terlaris"
      action={
        <Chips
          value={sort}
          onChange={(k) => setSort(k as typeof sort)}
          options={[
            { key: 'revenue', label: 'Omzet' },
            { key: 'packs', label: 'Pack' },
            { key: 'pcs', label: 'Pcs' },
          ]}
        />
      }
    >
      <BarList
        format={fmt}
        empty="Belum ada penjualan di periode ini."
        rows={rows.map((r, i) => ({
          key: r.key,
          label: `${i + 1}. ${r.productName}`,
          value: r[sort],
        }))}
      />
    </Card>
  );
}

// ─────────────────────────────── Arus kas ───────────────────────────────

export function CashflowView({ d }: { d: CashflowReport }) {
  const dr = d.cashDrawer;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="Kas masuk"
          value={formatRupiah(d.inflow.total)}
          sub={
            d.inflow.unpaid.count
              ? `+ ${formatRupiah(d.inflow.unpaid.amount)} belum dibayar (${d.inflow.unpaid.count})`
              : undefined
          }
        />
        <StatTile label="Kas keluar" value={formatRupiah(d.outflow.total)} />
        <StatTile label="Bersih" value={formatRupiah(d.net)} tone={d.net < 0 ? 'bad' : undefined} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Masuk per metode bayar">
          <BarList
            format={formatRupiah}
            rows={d.inflow.byMethod.map((m) => ({
              key: m.key,
              label: m.label,
              value: m.amount,
              sub: `${m.count} order`,
            }))}
          />
        </Card>
        <Card title="Keluar">
          <BarList
            format={formatRupiah}
            empty="Tidak ada kas keluar."
            rows={[
              ...(d.outflow.purchases
                ? [
                    {
                      key: 'purchases',
                      label: 'Belanja bahan (Stok Masuk)',
                      value: d.outflow.purchases,
                    },
                  ]
                : []),
              ...d.outflow.expenses.map((e) => ({ key: e.key, label: e.label, value: e.amount })),
            ]}
          />
        </Card>
      </div>
      <Card title="Kas laci (shift)">
        <StatementRow
          label={`Modal awal (${dr.sessions} shift)`}
          value={formatRupiah(dr.openingCash)}
        />
        <StatementRow label="+ Penjualan cash" value={formatRupiah(dr.cashSales)} />
        <StatementRow label="− Pengeluaran cash" value={formatRupiah(dr.cashExpenses)} />
        <StatementRow label="Total selisih kas" value={formatRupiah(dr.difference)} strong />
      </Card>
      <Card title="Per hari">
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs text-stone-500">
              <tr>
                <th className="py-1 font-medium">Tanggal</th>
                <th className="py-1 text-right font-medium">Masuk</th>
                <th className="py-1 text-right font-medium">Keluar</th>
                <th className="py-1 text-right font-medium">Bersih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 tabular-nums">
              {d.byDay.map((r) => (
                <tr key={r.date}>
                  <td className="py-1.5">{formatDateKey(r.date)}</td>
                  <td className="text-right">{formatRupiah(r.inflow)}</td>
                  <td className="text-right">{formatRupiah(r.outflow)}</td>
                  <td className={cn('text-right font-semibold', r.net < 0 && 'text-red-600')}>
                    {formatRupiah(r.net)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────── Mutasi stok ───────────────────────────────

export function StockMovementsView({ d }: { d: StockMovementReport }) {
  const [type, setType] = useState('');
  const rows = type ? d.rows.filter((r) => r.type === type) : d.rows;
  return (
    <div className="space-y-3">
      <Chips
        value={type}
        onChange={setType}
        options={[
          { key: '', label: 'Semua' },
          ...d.byType.map((t) => ({
            key: t.type,
            label: `${MOVEMENT_LABEL[t.type]} ${formatRupiah(Math.abs(t.value))}`,
          })),
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState title="Tidak ada mutasi di periode ini" />
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {rows.map((r) => (
            <li
              key={`${r.itemId}-${r.type}`}
              className="flex items-center gap-3 px-4 py-2.5 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.itemName}</p>
                <p className="text-xs text-stone-500">
                  {MOVEMENT_LABEL[r.type as MovementType]} · {r.count}×
                </p>
              </div>
              <div className="text-right tabular-nums">
                <p className={cn('font-semibold', r.qty < 0 ? 'text-red-600' : 'text-green-700')}>
                  {r.qty > 0 ? '+' : ''}
                  {fmtQty(r.qty)} {r.unit}
                </p>
                <p className="text-xs text-stone-500">{formatRupiah(r.value)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────── Shift ───────────────────────────────

export function ShiftsView({ d }: { d: { sessions: CashSessionView[] } }) {
  const [printing, setPrinting] = useState<CashSessionView | null>(null);
  if (d.sessions.length === 0) return <EmptyState title="Tidak ada shift di periode ini" />;
  return (
    <>
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
        {d.sessions.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {formatDateTime(s.openedAt)}
                {s.closedAt ? ` – ${formatDateTime(s.closedAt)}` : ''}
              </p>
              <p className="text-xs text-stone-500">
                {s.summary.orders} order · {formatRupiah(s.summary.sales)} · kas seharusnya{' '}
                {formatRupiah(s.expectedCash ?? s.summary.expectedCash)}
              </p>
            </div>
            {s.status === 'OPEN' ? (
              <Badge tone="green">Terbuka</Badge>
            ) : (s.difference ?? 0) === 0 ? (
              <Badge tone="green">Pas</Badge>
            ) : (
              <Badge tone={(s.difference ?? 0) < 0 ? 'red' : 'amber'}>
                {(s.difference ?? 0) < 0 ? 'Kurang ' : 'Lebih '}
                {formatRupiah(Math.abs(s.difference ?? 0))}
              </Badge>
            )}
            <Button variant="ghost" size="icon" aria-label="Cetak" onClick={() => setPrinting(s)}>
              <Printer className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
      {printing && <ShiftPrintDialog session={printing} onClose={() => setPrinting(null)} />}
    </>
  );
}

// ─────────────────────────────── Layanan QR ───────────────────────────────

export function QrServiceView({ d }: { d: QrServiceReport }) {
  const a = d.avgMinutes;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="Order QR" value={String(d.orders)} sub={`${d.paid} disetujui`} />
        <StatTile label="Omzet QR" value={formatRupiah(d.revenue)} />
        <StatTile label="Ditolak / batal" value={`${d.rejected} / ${d.cancelled}`} />
        <StatTile label="Rata-rata total" value={minutes(a.total)} sub="pesan → siap" />
      </div>
      <Card title="Rata-rata waktu per tahap">
        <StatementRow label="Pesan → disetujui" value={minutes(a.orderToPaid)} />
        <StatementRow label="Disetujui → siap/selesai" value={minutes(a.paidToDone)} />
      </Card>
      {d.byDay.length > 1 && (
        <Card title="Omzet QR per hari">
          <ColumnChart
            ariaLabel="Grafik omzet QR per hari"
            format={formatRupiah}
            data={dayPoints(
              d.byDay.map((r) => ({
                date: r.date,
                value: r.revenue,
                details: [{ label: 'order', value: String(r.orders) }],
              })),
            )}
          />
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────── Rekap harian ───────────────────────────────

export function DailyClosingView({ d }: { d: DailyClosingReport }) {
  const settings = useSettings();
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Omzet bersih"
            value={formatRupiah(d.summary.netSales)}
            sub={`${d.summary.orders} order`}
          />
          <StatTile
            label="Laba bersih"
            value={formatRupiah(d.netProfit)}
            tone={d.netProfit < 0 ? 'bad' : undefined}
          />
        </div>
        <Card title={`Rekap ${formatDateKey(d.date)}`}>
          <StatementRow label="Omzet bersih" value={formatRupiah(d.summary.netSales)} />
          <StatementRow label="− HPP" value={formatRupiah(d.summary.hpp)} />
          <StatementRow label="Laba kotor" value={formatRupiah(d.summary.grossProfit)} strong />
          <StatementRow label="− Pengeluaran" value={formatRupiah(d.expenses.total)} />
          <StatementRow label="− Waste" value={formatRupiah(d.waste)} />
          <StatementRow label="Laba bersih" value={formatRupiah(d.netProfit)} strong />
          <StatementRow label="Belanja bahan (kas keluar)" value={formatRupiah(d.purchases)} />
          <StatementRow label="Order masih menunggu" value={String(d.pending)} />
        </Card>
      </div>
      <Card title="Cetak tutup hari (58mm)">
        {settings.data ? (
          <PrintPreview lines={closingLines(d, settings.data)} label="Cetak rekap harian" />
        ) : (
          <LoadingState rows={3} />
        )}
      </Card>
    </div>
  );
}
