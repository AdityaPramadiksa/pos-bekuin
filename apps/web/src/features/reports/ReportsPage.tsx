import {
  REPORT_LABEL,
  REPORT_TYPES,
  type CashflowReport,
  type CashSessionView,
  type DailyClosingReport,
  type ProductProfitReport,
  type ProfitLossReport,
  type QrServiceReport,
  type ReportType,
  type SalesReport,
  type StockMovementReport,
  type TopProductsReport,
} from '@bekuin/shared';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { PeriodFilter, type Period } from '@/features/finance/PeriodFilter';
import { periodRange } from '@/features/finance/periods';
import { formatDateKey } from '@/features/orders/order-format';
import { api, errorMessage } from '@/lib/api';
import { useReport } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  CashflowView,
  DailyClosingView,
  ProductProfitView,
  ProfitLossView,
  QrServiceView,
  SalesView,
  ShiftsView,
  StockMovementsView,
  TopProductsView,
} from './ReportViews';

type AnyReport =
  | SalesReport
  | ProfitLossReport
  | ProductProfitReport
  | TopProductsReport
  | CashflowReport
  | StockMovementReport
  | { sessions: CashSessionView[] }
  | QrServiceReport
  | DailyClosingReport;

async function download(type: ReportType, format: 'csv' | 'xlsx', period: Period) {
  const res = await api.get<Blob>(`/reports/${type}/export`, {
    params: { format, from: period.from, to: type === 'daily-closing' ? undefined : period.to },
    responseType: 'blob',
  });
  const header = String(res.headers['content-disposition'] ?? '');
  const name = /filename="([^"]+)"/.exec(header)?.[1] ?? `bekuin-${type}.${format}`;
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportsPage() {
  const [type, setType] = useState<ReportType>(() => {
    const t = new URLSearchParams(window.location.search).get('type') as ReportType | null;
    return t && REPORT_TYPES.includes(t) ? t : 'sales';
  });
  const [period, setPeriod] = useState<Period>({ key: '7d', ...periodRange('7d') });
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);
  const single = type === 'daily-closing';
  // Rekap harian memakai satu tanggal: ambil tanggal akhir periode yang sedang dipilih.
  const effective: Period = single
    ? {
        key: ['today', 'yesterday'].includes(period.key) ? period.key : 'custom',
        from: period.to,
        to: period.to,
      }
    : period;
  const report = useReport<AnyReport>(type, effective);

  async function onExport(format: 'csv' | 'xlsx') {
    setExporting(format);
    try {
      await download(type, format, effective);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Laporan"
        subtitle={
          single
            ? formatDateKey(effective.from)
            : `${formatDateKey(effective.from)} – ${formatDateKey(effective.to)} (WITA)`
        }
      />
      <div className="mx-auto max-w-4xl space-y-3 p-4 md:p-6">
        <Chips
          value={type}
          onChange={(k) => setType(k as ReportType)}
          options={REPORT_TYPES.map((t) => ({ key: t, label: REPORT_LABEL[t] }))}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <PeriodFilter value={effective} onChange={setPeriod} single={single} />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={exporting === 'xlsx'}
              onClick={() => onExport('xlsx')}
            >
              <FileSpreadsheet className="size-4" /> Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={exporting === 'csv'}
              onClick={() => onExport('csv')}
            >
              <FileDown className="size-4" /> CSV
            </Button>
          </div>
        </div>

        {report.isPending ? (
          <LoadingState rows={4} />
        ) : report.isError ? (
          <ErrorState error={report.error} onRetry={() => report.refetch()} />
        ) : (
          <div className={cn('transition-opacity', report.isPlaceholderData && 'opacity-60')}>
            <ReportBody type={type} data={report.data} />
          </div>
        )}
      </div>
    </>
  );
}

function ReportBody({ type, data }: { type: ReportType; data: AnyReport }) {
  switch (type) {
    case 'sales':
      return <SalesView d={data as SalesReport} />;
    case 'profit-loss':
      return <ProfitLossView d={data as ProfitLossReport} />;
    case 'product-profit':
      return <ProductProfitView d={data as ProductProfitReport} />;
    case 'top-products':
      return <TopProductsView d={data as TopProductsReport} />;
    case 'cashflow':
      return <CashflowView d={data as CashflowReport} />;
    case 'stock-movements':
      return <StockMovementsView d={data as StockMovementReport} />;
    case 'shifts':
      return <ShiftsView d={data as { sessions: CashSessionView[] }} />;
    case 'qr-service':
      return <QrServiceView d={data as QrServiceReport} />;
    case 'daily-closing':
      return <DailyClosingView d={data as DailyClosingReport} />;
  }
}
