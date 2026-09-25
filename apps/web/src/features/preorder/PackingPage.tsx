import { type FulfillmentStatus, formatRupiah, type OrderView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Flame, PackageCheck, Printer, Tag, Truck } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { dateKeyWita, formatDateKey } from '@/features/orders/order-format';
import { StatusBadge } from '@/features/orders/order-ui';
import { printBytes } from '@/features/printer/bluetooth';
import { api, errorMessage } from '@/lib/api';
import { usePackingList, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { BulkApproveBar } from './BulkApproveBar';
import { copyText, invoiceText, labelBytes } from './texts';

const FILTERS = [
  { key: '', label: 'Semua' },
  { key: 'todo', label: 'Belum siap' },
  { key: 'ready', label: 'Siap' },
  { key: 'done', label: 'Diserahkan' },
  { key: 'unpaid', label: 'Belum bayar' },
];

export function PackingPage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(dateKeyWita(1));
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const list = usePackingList(date);
  const settings = useSettings();
  const storeName = settings.data?.storeName ?? 'Bekuin';
  const orders = list.data?.items ?? [];
  const ready = orders.filter(
    (o) => o.fulfillmentStatus === 'READY' || o.fulfillmentStatus === 'HANDED_OVER',
  ).length;
  const shown = orders.filter((o) => {
    if (filter === 'todo')
      return o.fulfillmentStatus === 'QUEUED' || o.fulfillmentStatus === 'PREPARING';
    if (filter === 'ready') return o.fulfillmentStatus === 'READY';
    if (filter === 'done') return o.fulfillmentStatus === 'HANDED_OVER';
    if (filter === 'unpaid') return o.status === 'PENDING';
    return true;
  });

  const setStatus = useMutation({
    mutationFn: (vars: { id: string; status: FulfillmentStatus }) =>
      api.patch(`/orders/${vars.id}/fulfillment`, { status: vars.status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['orders'] }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const print = async (bytes: Uint8Array) => {
    try {
      await printBytes(bytes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mencetak');
      throw e;
    }
  };
  const copy = async (text: string, what: string) =>
    toast[(await copyText(text)) ? 'success' : 'error'](`${what} disalin`);
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <PageHeader
        title="Packing & Tagihan"
        subtitle={
          orders.length
            ? `${ready} dari ${orders.length} siap · ${formatRupiah(orders.reduce((s, o) => s + o.total, 0))}`
            : 'Per tanggal kirim'
        }
        action={
          <Input
            type="date"
            aria-label="Tanggal kirim"
            className="w-40"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        }
      />
      <div className="mx-auto max-w-3xl space-y-3 p-4 pb-40 md:p-6 md:pb-40">
        {orders.length > 0 && (
          <div
            className="h-2 overflow-hidden rounded-full bg-stone-200"
            aria-label={`${ready} dari ${orders.length} siap`}
          >
            <div
              className="h-full bg-green-600 transition-all"
              style={{ width: `${(ready / orders.length) * 100}%` }}
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Chips options={FILTERS} value={filter} onChange={setFilter} />
          {orders.length > 0 && (
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copy(
                    orders.map((o) => invoiceText(o, storeName)).join('\n\n———\n\n'),
                    'Semua tagihan',
                  )
                }
              >
                <Copy className="size-4" /> Salin semua tagihan
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  for (const o of shown) await print(labelBytes(o, storeName));
                  toast.success(`${shown.length} label dicetak`);
                }}
              >
                <Tag className="size-4" /> Cetak semua label
              </Button>
            </div>
          )}
        </div>

        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : shown.length === 0 ? (
          <EmptyState title={`Tidak ada pesanan untuk ${formatDateKey(date)}`} />
        ) : (
          <ul className="space-y-3">
            {shown.map((o) => (
              <li key={o.id}>
                <PackingCard
                  order={o}
                  selected={selected.has(o.id)}
                  onToggle={() => toggle(o.id)}
                  onStatus={(status) => setStatus.mutate({ id: o.id, status })}
                  onLabel={() =>
                    print(labelBytes(o, storeName)).then(() => toast.success('Label dicetak'))
                  }
                  onInvoice={() =>
                    copy(invoiceText(o, storeName), `Tagihan ${o.customerName ?? o.orderNo}`)
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <BulkApproveBar
        selected={orders.filter((o) => selected.has(o.id) && o.status === 'PENDING')}
        onDone={() => setSelected(new Set())}
      />
    </>
  );
}

function PackingCard({
  order: o,
  selected,
  onToggle,
  onStatus,
  onLabel,
  onInvoice,
}: {
  order: OrderView;
  selected: boolean;
  onToggle: () => void;
  onStatus: (s: FulfillmentStatus) => void;
  onLabel: () => void;
  onInvoice: () => void;
}) {
  const packed = o.fulfillmentStatus === 'READY' || o.fulfillmentStatus === 'HANDED_OVER';
  return (
    <div
      className={cn(
        'rounded-2xl bg-white p-3 shadow-sm',
        packed && 'ring-1 ring-green-300',
        selected && 'ring-brand-600 ring-2',
      )}
    >
      <div className="flex items-start gap-2">
        {o.status === 'PENDING' && (
          <input
            type="checkbox"
            aria-label={`Pilih ${o.orderNo}`}
            className="mt-1 size-4"
            checked={selected}
            onChange={onToggle}
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{o.customerName ?? '(tanpa nama)'}</p>
          <p className="text-xs text-stone-500">{o.orderNo}</p>
        </div>
        <div className="text-right">
          <p className="font-bold">{formatRupiah(o.total)}</p>
          <StatusBadge status={o.status} />
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 text-sm">
        {o.items.map((i) => (
          <li key={i.id} className="flex items-center gap-2">
            <span className="w-7 font-semibold">{i.qty}×</span>
            <span className="flex-1">
              {i.productName} isi {i.packSize}
            </span>
            {i.categoryCode === 'SIAP_MAKAN' ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                <Flame className="size-3" /> Goreng dulu
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-sky-700">FROZEN</span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        {o.fulfillmentStatus === 'HANDED_OVER' ? (
          <Button size="sm" variant="ghost" onClick={() => onStatus('READY')}>
            <Truck className="size-4" /> Diserahkan ✓
          </Button>
        ) : packed ? (
          <>
            <Button size="sm" variant="outline" onClick={() => onStatus('QUEUED')}>
              <PackageCheck className="size-4 text-green-700" /> Siap ✓
            </Button>
            <Button size="sm" onClick={() => onStatus('HANDED_OVER')}>
              <Truck className="size-4" /> Serahkan
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => onStatus('READY')}>
            <PackageCheck className="size-4" /> Tandai siap
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onLabel}>
          <Printer className="size-4" /> Label
        </Button>
        <Button size="sm" variant="ghost" onClick={onInvoice}>
          <Copy className="size-4" /> Tagihan
        </Button>
      </div>
    </div>
  );
}
