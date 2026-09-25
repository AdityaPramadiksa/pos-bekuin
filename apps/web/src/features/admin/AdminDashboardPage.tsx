import { formatRupiah, SOURCE_LABEL, type OrderSource } from '@bekuin/shared';
import {
  AlertTriangle,
  CalendarClock,
  ClipboardCheck,
  Landmark,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { formatDateKey, formatTime } from '@/features/orders/order-format';
import { useTodaySummary } from '@/lib/queries';
import { useAuthStore } from '@/stores/auth';

function Stat({
  label,
  value,
  sub,
  icon,
  to,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  to?: string;
}) {
  const body = (
    <div className="h-full rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-stone-500">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-1 text-lg font-bold whitespace-nowrap sm:text-2xl">{value}</p>
      {sub && <p className="text-xs text-stone-500">{sub}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function AdminDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const summary = useTodaySummary();
  const s = summary.data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Halo, ${user?.name ?? 'Admin'}${s ? ` · ${formatDateKey(s.date)}` : ''}`}
      />
      <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
        {summary.isPending ? (
          <LoadingState rows={3} />
        ) : summary.isError ? (
          <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
        ) : (
          s && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat
                  label="Menunggu approval"
                  value={String(s.pending.total)}
                  sub={
                    Object.entries(s.pending.bySource)
                      .map(([k, v]) => `${SOURCE_LABEL[k as OrderSource]} ${v}`)
                      .join(' · ') || 'Tidak ada'
                  }
                  icon={<ClipboardCheck className="size-4" />}
                  to="/admin/approval"
                />
                <Stat
                  label="Omzet hari ini"
                  value={formatRupiah(s.paid.revenue)}
                  sub={`${s.paid.count} order disetujui`}
                  icon={<Wallet className="size-4" />}
                />
                <Stat
                  label="Laba kotor"
                  value={formatRupiah(s.paid.grossProfit)}
                  sub="Omzet − HPP"
                  icon={<TrendingUp className="size-4" />}
                />
                <Stat
                  label="Stok menipis"
                  value={String(s.lowStock.products + s.lowStock.ingredients)}
                  sub={`${s.lowStock.products} produk · ${s.lowStock.ingredients} bahan`}
                  icon={<AlertTriangle className="size-4" />}
                  to="/admin/stok"
                />
              </div>
              <Link
                to="/admin/lainnya/keuangan"
                className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm hover:bg-stone-50"
              >
                <Landmark
                  className={s.cashSession ? 'size-5 text-green-700' : 'size-5 text-amber-600'}
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold">
                    {s.cashSession
                      ? `Shift kasir terbuka sejak ${formatTime(s.cashSession.openedAt)}`
                      : 'Shift kasir belum dibuka'}
                  </p>
                  <p className="text-xs text-stone-500">
                    {s.cashSession
                      ? `Kas seharusnya di laci ${formatRupiah(s.cashSession.expectedCash)}`
                      : 'Buka shift dulu agar bisa menerima pembayaran cash.'}
                  </p>
                </div>
                <span className="text-brand-700 text-sm font-semibold">
                  {s.cashSession ? 'Kelola' : 'Buka shift'}
                </span>
              </Link>
              <section className="bg-brand-700 flex flex-wrap items-center gap-3 rounded-2xl p-4 text-white shadow-sm">
                <CalendarClock className="size-6" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Besok · {formatDateKey(s.tomorrow.date)}</p>
                  <p className="text-sm text-white/85">
                    {s.tomorrow.orders === 0
                      ? 'Belum ada pre-order.'
                      : `${s.tomorrow.customers} pelanggan · ${s.tomorrow.packs} pack · ${s.tomorrow.pcs} pcs · ${formatRupiah(s.tomorrow.amount)}`}
                  </p>
                </div>
                <Link
                  to="/admin/order/rekap"
                  className="text-brand-700 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold"
                >
                  Lihat Rekap
                </Link>
              </section>
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Omzet 7 hari terakhir</h2>
                  <Link
                    to="/admin/lainnya/laporan"
                    className="text-brand-700 text-xs font-semibold"
                  >
                    Laporan lengkap →
                  </Link>
                </div>
                <ColumnChart
                  ariaLabel="Grafik omzet 7 hari terakhir"
                  format={formatRupiah}
                  data={s.last7Days.map((d) => ({
                    key: d.date,
                    label: formatDateKey(d.date).split(',')[0],
                    title: formatDateKey(d.date),
                    value: d.revenue,
                    details: [
                      { label: 'order', value: String(d.orders) },
                      { label: 'laba kotor', value: formatRupiah(d.grossProfit) },
                    ],
                  }))}
                />
              </section>
              <section className="rounded-2xl bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold">Per metode bayar hari ini</h2>
                {s.byPaymentMethod.length === 0 ? (
                  <p className="mt-2 text-sm text-stone-500">Belum ada penjualan hari ini.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-stone-100 text-sm">
                    {s.byPaymentMethod.map((m) => (
                      <li key={m.name} className="flex justify-between py-2">
                        <span>
                          {m.name} <span className="text-stone-500">({m.count})</span>
                        </span>
                        <span className="font-semibold tabular-nums">{formatRupiah(m.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )
        )}
      </div>
    </>
  );
}
