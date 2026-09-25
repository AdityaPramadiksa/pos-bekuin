import { formatRupiah, type PublicOrderView } from '@bekuin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { categoryLabel, formatTime } from '@/features/orders/order-format';
import { errorMessage, publicApi } from '@/lib/api';
import { compressImage } from '@/lib/image';
import { createSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { findMyOrder } from './my-orders';
import { PaymentPanel } from './PaymentPanel';

/** Tahap yang dilihat pelanggan. */
function steps(o: PublicOrderView) {
  const paid = o.status === 'PAID';
  const f = o.fulfillmentStatus;
  return [
    { label: 'Pesanan diterima', done: true, at: o.createdAt },
    {
      label: o.payAtCashier ? 'Dibayar di kasir' : 'Pembayaran dikonfirmasi',
      done: paid,
      at: o.approvedAt,
    },
    { label: 'Sedang disiapkan', done: paid && f !== 'QUEUED', at: null },
    {
      label: o.type === 'DINE_IN' ? 'Siap diantar ke meja' : 'Siap diambil',
      done: paid && (f === 'READY' || f === 'HANDED_OVER'),
      at: o.readyAt,
    },
    { label: 'Selesai', done: paid && f === 'HANDED_OVER', at: o.handedOverAt },
  ];
}

function headline(o: PublicOrderView): {
  title: string;
  sub: string;
  tone: 'amber' | 'green' | 'red' | 'blue';
} {
  if (o.status === 'REJECTED')
    return { title: 'Pesanan ditolak', sub: o.reason ?? 'Silakan hubungi kasir.', tone: 'red' };
  if (o.status === 'CANCELLED')
    return { title: 'Pesanan dibatalkan', sub: o.reason ?? '', tone: 'red' };
  if (o.status === 'VOIDED')
    return { title: 'Pesanan dibatalkan kasir', sub: 'Silakan hubungi kasir.', tone: 'red' };
  if (o.status === 'PENDING') {
    if (o.payAtCashier)
      return {
        title: 'Silakan bayar di kasir',
        sub: `Sebutkan nomor pesanan ${o.orderNo}`,
        tone: 'amber',
      };
    if (o.hasPaymentProof)
      return {
        title: 'Menunggu konfirmasi',
        sub: 'Bukti bayar sudah terkirim, kasir sedang mengecek.',
        tone: 'amber',
      };
    return {
      title: 'Menunggu pembayaran',
      sub:
        o.payment.type === 'TRANSFER'
          ? 'Transfer sesuai nominal di bawah.'
          : 'Scan QRIS di bawah dan bayar sesuai nominal.',
      tone: 'amber',
    };
  }
  if (o.fulfillmentStatus === 'HANDED_OVER')
    return { title: 'Selesai. Terima kasih!', sub: 'Selamat menikmati 🥟', tone: 'green' };
  if (o.fulfillmentStatus === 'READY') {
    return {
      title: 'Pesanan siap!',
      sub: o.type === 'DINE_IN' ? 'Segera diantar ke meja kamu.' : 'Silakan ambil di kasir.',
      tone: 'green',
    };
  }
  if (o.fulfillmentStatus === 'PREPARING')
    return { title: 'Sedang disiapkan', sub: 'Mohon ditunggu sebentar ya.', tone: 'blue' };
  return { title: 'Pembayaran diterima', sub: 'Pesanan masuk antrian dapur.', tone: 'blue' };
}

const TONE = {
  amber: 'bg-amber-50 text-amber-900',
  green: 'bg-green-50 text-green-900',
  red: 'bg-red-50 text-red-900',
  blue: 'bg-sky-50 text-sky-900',
};

export function OrderTrackingPage() {
  const { publicToken = '' } = useParams();
  const queryClient = useQueryClient();
  const key = ['public-order', publicToken];
  const order = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await publicApi.get<PublicOrderView>(`/public/orders/${publicToken}`)).data,
    retry: false,
    refetchInterval: 20_000, // cadangan bila koneksi realtime putus
  });

  // Realtime: pantau pesanan ini lewat Socket.IO (tanpa login).
  useEffect(() => {
    const socket = createSocket(() => null);
    const watch = () => socket.emit('order.watch', publicToken);
    socket.on('connect', watch);
    socket.on(
      'order.status',
      () => void queryClient.invalidateQueries({ queryKey: ['public-order', publicToken] }),
    );
    return () => {
      socket.disconnect();
    };
  }, [publicToken, queryClient]);

  if (order.isPending) {
    return (
      <div className="mx-auto max-w-md p-4">
        <LoadingState rows={4} />
      </div>
    );
  }
  if (order.isError) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
        <ErrorState error={order.error} onRetry={() => order.refetch()} />
      </div>
    );
  }
  return <Tracking order={order.data} />;
}

function Tracking({ order: o }: { order: PublicOrderView }) {
  const queryClient = useQueryClient();
  const mine = findMyOrder(o.publicToken);
  const h = headline(o);
  const setData = (data: PublicOrderView) =>
    queryClient.setQueryData(['public-order', o.publicToken], data);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const blob = await compressImage(file, { maxSide: 1600, targetBytes: 500 * 1024 });
      const form = new FormData();
      form.append('file', blob, 'bukti.webp');
      return (
        await publicApi.post<PublicOrderView>(`/public/orders/${o.publicToken}/payment-proof`, form)
      ).data;
    },
    onSuccess: (data) => {
      setData(data);
      toast.success('Bukti bayar terkirim');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const cancel = useMutation({
    mutationFn: async () =>
      (await publicApi.post<PublicOrderView>(`/public/orders/${o.publicToken}/cancel`)).data,
    onSuccess: setData,
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="bg-cream mx-auto min-h-dvh max-w-md space-y-4 p-4 pb-10">
      <header className="text-center">
        <p className="text-sm text-stone-500">
          {o.store.name}
          {o.tableName ? ` · ${o.tableName}` : ''}
        </p>
        <p className="text-2xl font-bold tracking-wide">{o.orderNo}</p>
        {o.customerName && <p className="text-sm text-stone-600">a.n. {o.customerName}</p>}
      </header>

      <section className={cn('rounded-2xl p-4 text-center', TONE[h.tone])}>
        {h.tone === 'red' ? (
          <XCircle className="mx-auto size-8" />
        ) : h.tone === 'green' ? (
          <CheckCircle2 className="mx-auto size-8" />
        ) : (
          <Loader2 className="mx-auto size-8 animate-spin" />
        )}
        <p className="mt-1 text-lg font-bold">{h.title}</p>
        <p className="text-sm">{h.sub}</p>
      </section>

      {o.status === 'PENDING' && (
        <PaymentPanel order={o} uploading={upload.isPending} onUpload={(f) => upload.mutate(f)} />
      )}

      {o.status === 'PAID' && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <ol className="space-y-3">
            {steps(o).map((s) => (
              <li key={s.label} className="flex items-center gap-3">
                {s.done ? (
                  <CheckCircle2 className="size-5 text-green-600" />
                ) : (
                  <Circle className="size-5 text-stone-300" />
                )}
                <span className={cn('flex-1 text-sm', s.done ? 'font-medium' : 'text-stone-400')}>
                  {s.label}
                </span>
                {s.done && s.at && (
                  <span className="text-xs text-stone-500">{formatTime(s.at)}</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <ul className="divide-y divide-stone-100 text-sm">
          {o.items.map((i, idx) => (
            <li key={idx} className="flex justify-between gap-2 py-2">
              <span>
                {i.qty}× {i.productName} isi {i.packSize}
                <span className="block text-xs text-stone-500">
                  {categoryLabel(i.categoryCode)}
                </span>
              </span>
              <span className="tabular-nums">{formatRupiah(i.subtotal)}</span>
            </li>
          ))}
          {o.discount > 0 && (
            <li className="flex justify-between py-2 text-stone-600">
              <span>Diskon</span>
              <span>-{formatRupiah(o.discount)}</span>
            </li>
          )}
          <li className="flex justify-between py-2 font-bold">
            <span>Total{o.paymentMethodName ? ` · ${o.paymentMethodName}` : ''}</span>
            <span>{formatRupiah(o.total)}</span>
          </li>
        </ul>
      </section>

      <div className="space-y-2">
        {mine && (
          <Link to={`/m/${mine.qrToken}`} className="block">
            <Button variant="outline" size="lg" className="w-full">
              Pesan lagi
            </Button>
          </Link>
        )}
        {o.canCancel && (
          <Button
            variant="ghost"
            className="w-full text-red-600"
            loading={cancel.isPending}
            onClick={() => window.confirm('Batalkan pesanan ini?') && cancel.mutate()}
          >
            Batalkan pesanan
          </Button>
        )}
        {o.store.phone && (
          <p className="text-center text-xs text-stone-500">Ada kendala? Hubungi {o.store.phone}</p>
        )}
      </div>
    </div>
  );
}
