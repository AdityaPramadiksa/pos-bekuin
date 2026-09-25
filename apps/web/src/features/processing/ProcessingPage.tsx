import {
  completeActionLabel,
  formatRupiah,
  isUnpaid,
  type OrderView,
  type ProcessingSummary,
  summarizeProcessing,
} from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CheckCircle2,
  Copy,
  Flame,
  MapPin,
  Phone,
  Printer,
  Receipt,
  Tag,
  Undo2,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { MarkPaidDialog } from '@/features/orders/MarkPaidDialog';
import { SourceBadge, StatusBadge } from '@/features/orders/order-ui';
import {
  categoryLabel,
  dateKeyWita,
  formatDateKey,
  formatTime,
} from '@/features/orders/order-format';
import { copyText, invoiceText, labelBytes } from '@/features/preorder/texts';
import { printBytes } from '@/features/printer/bluetooth';
import { isPrinterConnected, printReceipt } from '@/features/printer/receipt';
import { api, errorMessage } from '@/lib/api';
import { useProcessing, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { summaryBytes, summaryText } from './texts';

/**
 * Order yang sudah disetujui dan harus disiapkan: rangkuman total item (berapa yang harus
 * disiapkan), lalu daftar per pelanggan untuk dibagi ke kantong masing-masing → Selesai.
 */
export function ProcessingPage() {
  const data = useProcessing();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const settings = useSettings();
  const [view, setView] = useState<'processing' | 'done'>('processing');
  const [dateFilter, setDateFilter] = useState('today');
  const [paying, setPaying] = useState<OrderView | null>(null);
  const today = dateKeyWita();

  const processing = data.data?.processing ?? [];
  const done = data.data?.done ?? [];
  const futureDates = [...new Set(processing.map((o) => o.deliveryDate))]
    .filter((d) => d > today)
    .sort();
  const shown = processing.filter((o) =>
    dateFilter === 'all'
      ? true
      : dateFilter === 'today'
        ? o.deliveryDate <= today
        : o.deliveryDate === dateFilter,
  );
  const summary = summarizeProcessing(shown);
  const scopeTitle =
    dateFilter === 'all'
      ? 'Semua tanggal'
      : dateFilter === 'today'
        ? `Hari ini, ${formatDateKey(today)}`
        : formatDateKey(dateFilter);
  const storeName = settings.data?.storeName ?? 'Bekuin';

  const print = async (bytes: Uint8Array, success: string) => {
    try {
      await printBytes(bytes);
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mencetak');
    }
  };

  return (
    <>
      <PageHeader
        title="Diproses"
        subtitle={
          processing.length
            ? `${processing.length} order harus disiapkan`
            : 'Order yang sudah disetujui'
        }
      />
      <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-6">
        {isAdmin && !isPrinterConnected() && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            Printer belum terhubung, jadi struk QRIS yang masuk otomatis tidak tercetak.{' '}
            <Link to="/admin/lainnya/printer" className="font-semibold underline">
              Hubungkan printer
            </Link>
          </p>
        )}
        <Chips
          value={view}
          onChange={(v) => setView(v as 'processing' | 'done')}
          options={[
            { key: 'processing', label: 'Diproses', count: processing.length },
            { key: 'done', label: 'Selesai hari ini', count: done.length },
          ]}
        />

        {data.isPending ? (
          <LoadingState />
        ) : data.isError ? (
          <ErrorState error={data.error} onRetry={() => data.refetch()} />
        ) : view === 'done' ? (
          done.length === 0 ? (
            <EmptyState title="Belum ada yang selesai hari ini" />
          ) : (
            <ul className="space-y-2">
              {done.map((o) => (
                <li key={o.id}>
                  <DoneCard order={o} isAdmin={isAdmin} onPay={() => setPaying(o)} />
                </li>
              ))}
            </ul>
          )
        ) : processing.length === 0 ? (
          <EmptyState
            title="Tidak ada order yang diproses"
            description="Order yang disetujui (atau QRIS yang masuk otomatis) muncul di sini."
          />
        ) : (
          <>
            <Chips
              value={dateFilter}
              onChange={setDateFilter}
              options={[
                {
                  key: 'today',
                  label: 'Hari ini',
                  count: processing.filter((o) => o.deliveryDate <= today).length,
                },
                ...futureDates.map((d) => ({
                  key: d,
                  label: formatDateKey(d),
                  count: processing.filter((o) => o.deliveryDate === d).length,
                })),
                ...(futureDates.length ? [{ key: 'all', label: 'Semua' }] : []),
              ]}
            />
            {shown.length === 0 ? (
              <EmptyState title={`Tidak ada order untuk ${scopeTitle}`} />
            ) : (
              <>
                <SummaryCard
                  summary={summary}
                  title={scopeTitle}
                  onCopy={async () =>
                    toast[(await copyText(summaryText(summary, scopeTitle))) ? 'success' : 'error'](
                      'Rangkuman disalin',
                    )
                  }
                  onPrint={() => print(summaryBytes(summary, scopeTitle), 'Rangkuman dicetak')}
                />
                <div className="flex items-center justify-between pt-2">
                  <h2 className="font-semibold">Per pelanggan ({shown.length})</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        for (const o of shown) await printBytes(labelBytes(o, storeName));
                        toast.success(`${shown.length} label dicetak`);
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : 'Gagal mencetak');
                      }
                    }}
                  >
                    <Tag className="size-4" /> Cetak semua label
                  </Button>
                </div>
                <ul className="space-y-3">
                  {shown.map((o) => (
                    <li key={o.id}>
                      <ProcessingCard
                        order={o}
                        isAdmin={isAdmin}
                        today={today}
                        onPay={() => setPaying(o)}
                        onLabel={() => print(labelBytes(o, storeName), 'Label dicetak')}
                        onInvoice={async () =>
                          toast[(await copyText(invoiceText(o, storeName))) ? 'success' : 'error'](
                            `Tagihan ${o.customerName ?? o.orderNo} disalin`,
                          )
                        }
                        onReceipt={async () => {
                          if (!settings.data) return;
                          try {
                            await printReceipt(o, settings.data, { reprint: true });
                            toast.success('Struk dicetak');
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : 'Gagal mencetak');
                          }
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
      <MarkPaidDialog order={paying} onClose={() => setPaying(null)} />
    </>
  );
}

function SummaryCard({
  summary,
  title,
  onCopy,
  onPrint,
}: {
  summary: ProcessingSummary;
  title: string;
  onCopy: () => void;
  onPrint: () => void;
}) {
  return (
    <section
      className="rounded-2xl bg-white p-4 shadow-sm"
      aria-label="Rangkuman yang harus disiapkan"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">Yang harus disiapkan</h2>
          <p className="text-xs text-stone-500">{title}</p>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" aria-label="Salin rangkuman" onClick={onCopy}>
            <Copy className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Cetak rangkuman" onClick={onPrint}>
            <Printer className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'order', value: summary.orders },
          { label: 'pack', value: summary.packs },
          { label: 'pcs', value: summary.pcs },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-stone-50 py-2">
            <p className="text-xl font-bold tabular-nums">{s.value}</p>
            <p className="text-xs text-stone-500">{s.label}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 divide-y divide-stone-100">
        {summary.rows.map((r) => (
          <li key={r.productId} className="py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{r.productName}</span>
              <span className="text-lg font-bold tabular-nums">{r.pcs} pcs</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {r.lines.map((l) => (
                <span
                  key={`${l.categoryCode}-${l.packSize}`}
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    l.categoryCode === 'SIAP_MAKAN'
                      ? 'bg-orange-100 text-orange-800'
                      : 'bg-sky-50 text-sky-800',
                  )}
                >
                  {categoryLabel(l.categoryCode)} isi {l.packSize} × {l.packs}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {summary.fryPacks > 0 && (
        <p className="mt-2 flex items-center gap-1 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <Flame className="size-4" /> {summary.fryPacks} pack siap makan perlu digoreng dulu
        </p>
      )}
    </section>
  );
}

function useFulfillment(order: OrderView) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: 'PROCESSING' | 'DONE') =>
      api.patch<OrderView>(`/orders/${order.id}/fulfillment`, { status }),
    onSuccess: (_d, status) => {
      toast.success(
        status === 'DONE'
          ? `${order.customerName ?? order.orderNo}: ${completeActionLabel(order).replace('Tandai ', '')}`
          : `${order.orderNo} dikembalikan ke Diproses`,
      );
      void queryClient.invalidateQueries({ queryKey: ['processing'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function ProcessingCard({
  order: o,
  isAdmin,
  today,
  onPay,
  onLabel,
  onInvoice,
  onReceipt,
}: {
  order: OrderView;
  isAdmin: boolean;
  today: string;
  onPay: () => void;
  onLabel: () => void;
  onInvoice: () => void;
  onReceipt: () => void;
}) {
  const move = useFulfillment(o);
  const unpaid = isUnpaid(o);
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-lg leading-tight font-bold">
              {o.customerName ?? o.table?.name ?? o.orderNo}
            </span>
            <SourceBadge order={o} />
          </div>
          <p className="text-xs text-stone-500">
            {o.orderNo}
            {o.approvedAt ? ` · disetujui ${formatTime(o.approvedAt)}` : ''}
            {o.deliveryDate !== today ? ` · kirim ${formatDateKey(o.deliveryDate)}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold tabular-nums">{formatRupiah(o.total)}</p>
          <p className={cn('text-xs font-semibold', unpaid ? 'text-red-600' : 'text-green-700')}>
            {unpaid ? 'Belum dibayar' : 'Lunas'}
            {o.paymentMethod ? ` · ${o.paymentMethod.name}` : ''}
          </p>
        </div>
      </div>

      {(o.deliveryMethod || o.customerPhone) && (
        <div className="mt-2 space-y-0.5 text-sm text-stone-600">
          {o.deliveryMethod === 'DELIVERY' ? (
            <p className="flex gap-1">
              <MapPin className="mt-0.5 size-4 shrink-0 text-stone-400" />
              <span>Antar: {o.deliveryAddress ?? '-'}</span>
            </p>
          ) : o.deliveryMethod === 'PICKUP' ? (
            <p className="flex gap-1">
              <MapPin className="mt-0.5 size-4 shrink-0 text-stone-400" /> Ambil sendiri
            </p>
          ) : null}
          {o.customerPhone && (
            <a
              href={`https://wa.me/${o.customerPhone.replace(/^0/, '62').replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-green-700"
            >
              <Phone className="size-4" /> {o.customerPhone}
            </a>
          )}
        </div>
      )}

      <ul className="mt-2 space-y-1 rounded-xl bg-stone-50 p-2">
        {o.items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <span className="w-7 font-bold">{i.qty}×</span>
            <span className="flex-1">
              {i.productName} isi {i.packSize}
              {i.note && <span className="block text-xs text-amber-800">↳ {i.note}</span>}
            </span>
            {i.categoryCode === 'SIAP_MAKAN' ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                <Flame className="size-3" /> Goreng
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-sky-700">FROZEN</span>
            )}
          </li>
        ))}
      </ul>
      {o.note && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">{o.note}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" onClick={onLabel}>
          <Tag className="size-4" /> Label
        </Button>
        <Button size="sm" variant="ghost" onClick={onReceipt}>
          <Receipt className="size-4" /> Struk
        </Button>
        {o.customerName && (
          <Button size="sm" variant="ghost" onClick={onInvoice}>
            <Copy className="size-4" /> Tagihan
          </Button>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        {isAdmin && unpaid && (
          <Button variant="outline" className="flex-1 basis-0" onClick={onPay}>
            <Banknote className="size-4" /> Sudah dibayar
          </Button>
        )}
        <Button
          className="flex-1 basis-0"
          loading={move.isPending}
          onClick={() => move.mutate('DONE')}
        >
          <CheckCircle2 className="size-4" /> {completeActionLabel(o)}
        </Button>
      </div>
    </div>
  );
}

function DoneCard({
  order: o,
  isAdmin,
  onPay,
}: {
  order: OrderView;
  isAdmin: boolean;
  onPay: () => void;
}) {
  const move = useFulfillment(o);
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{o.customerName ?? o.table?.name ?? o.orderNo}</p>
        <p className="text-xs text-stone-500">
          {o.orderNo}
          {o.completedAt ? ` · ${formatTime(o.completedAt)}` : ''} · {formatRupiah(o.total)}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          <StatusBadge order={o} />
        </div>
      </div>
      {isAdmin && isUnpaid(o) && (
        <Button size="sm" variant="outline" onClick={onPay}>
          <Banknote className="size-4" /> Sudah dibayar
        </Button>
      )}
      {isAdmin && (
        <Button
          size="icon"
          variant="ghost"
          aria-label="Kembalikan ke Diproses"
          loading={move.isPending}
          onClick={() => move.mutate('PROCESSING')}
        >
          <Undo2 className="size-4" />
        </Button>
      )}
    </div>
  );
}
