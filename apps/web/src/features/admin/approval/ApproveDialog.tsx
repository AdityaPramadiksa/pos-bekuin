import {
  formatRupiah,
  ORDER_STATUS_LABEL,
  type OrderView,
  type PaymentMethodView,
  quickCashAmounts,
} from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Minus, Plus, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput } from '@/components/ui/input';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { SourceBadge } from '@/features/orders/order-ui';
import { categoryLabel } from '@/features/orders/order-format';
import { isPrinterConnected, printReceipt } from '@/features/printer/receipt';
import { api, assetUrl, errorMessage } from '@/lib/api';
import { useOrder, usePaymentMethods, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function ApproveDialog({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const order = useOrder(orderId);
  return (
    <Dialog
      open={!!orderId}
      onClose={onClose}
      size="lg"
      title={order.data ? `Bayar ${order.data.orderNo}` : 'Proses pembayaran'}
    >
      {order.isPending ? (
        <LoadingState rows={3} />
      ) : order.isError ? (
        <ErrorState error={order.error} onRetry={() => order.refetch()} />
      ) : (
        // key hanya id: data yang dimuat ulang (event realtime) tidak boleh me-reset layar hasil bayar.
        <ApproveForm key={order.data.id} order={order.data} onClose={onClose} />
      )}
    </Dialog>
  );
}

function ApproveForm({ order, onClose }: { order: OrderView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const methods = usePaymentMethods();
  const settings = useSettings();
  const [qty, setQty] = useState<Record<string, number>>(
    Object.fromEntries(order.items.map((i) => [i.id, i.qty])),
  );
  const [discountMode, setDiscountMode] = useState<'rp' | 'pct'>('rp');
  const [discountInput, setDiscountInput] = useState<number | ''>('');
  const [methodId, setMethodId] = useState<string | null>(null);
  const [paid, setPaid] = useState<number | ''>('');
  const [paymentRef, setPaymentRef] = useState('');
  const [done, setDone] = useState<OrderView | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const subtotal = order.items.reduce((sum, i) => sum + (qty[i.id] ?? 0) * i.price, 0);
  const discount =
    discountInput === ''
      ? 0
      : discountMode === 'rp'
        ? discountInput
        : Math.round((subtotal * Math.min(discountInput, 100)) / 100);
  const total = Math.max(0, subtotal - discount);
  const method = methods.data?.find((m) => m.id === methodId) ?? null;
  const isCash = method?.type === 'CASH';
  const change = isCash && paid !== '' ? paid - total : 0;
  const itemCount = Object.values(qty).filter((q) => q > 0).length;
  const invalid =
    !method || itemCount === 0 || discount > subtotal || (isCash && (paid === '' || paid < total));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['order', order.id] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
    void queryClient.invalidateQueries({ queryKey: ['catalog'] });
    void queryClient.invalidateQueries({ queryKey: ['stock'] });
  };

  const approve = useMutation({
    mutationFn: async () => {
      const items = order.items
        .filter((i) => qty[i.id] !== i.qty)
        .map((i) => ({ id: i.id, qty: qty[i.id] ?? 0 }));
      return (
        await api.post<OrderView>(`/orders/${order.id}/approve`, {
          paymentMethodId: methodId,
          paidAmount: isCash ? paid : undefined,
          discount,
          paymentRef: paymentRef.trim() || null,
          items: items.length ? items : undefined,
        })
      ).data;
    },
    onSuccess: async (paidOrder) => {
      refresh();
      setDone(paidOrder);
      // Order tetap PAID walau printer gagal; tombol cetak ulang tersedia.
      if (settings.data && isPrinterConnected()) {
        try {
          await printReceipt(paidOrder, settings.data);
          toast.success('Lunas & struk dicetak');
        } catch (error) {
          toast.error(
            `Lunas, tapi struk gagal dicetak: ${error instanceof Error ? error.message : ''}`,
          );
        }
      } else {
        toast.success('Order lunas. Printer belum terhubung — cetak dari tombol di bawah.');
      }
    },
    onError: (error) => toast.error(errorMessage(error), { duration: 8000 }),
  });

  const reject = useMutation({
    mutationFn: () => api.post(`/orders/${order.id}/reject`, { reason }),
    onSuccess: () => {
      refresh();
      toast.success('Order ditolak');
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const print = useMutation({
    mutationFn: () => printReceipt(done!, settings.data!),
    onSuccess: () => toast.success('Struk dicetak'),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Gagal mencetak'),
  });

  if (done) {
    return (
      <div className="space-y-4 py-4 text-center">
        <CheckCircle2 className="mx-auto size-14 text-green-600" />
        <div>
          <p className="text-lg font-bold">Lunas {formatRupiah(done.total)}</p>
          <p className="text-sm text-stone-500">
            {done.orderNo} · {done.paymentMethod?.name}
          </p>
        </div>
        {!!done.changeAmount && (
          <div className="rounded-2xl bg-green-50 p-4">
            <p className="text-sm text-green-800">Kembalian</p>
            <p className="text-3xl font-bold text-green-800">{formatRupiah(done.changeAmount)}</p>
          </div>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            loading={print.isPending}
            onClick={() => print.mutate()}
          >
            <Printer className="size-4" /> Cetak struk
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Selesai
          </Button>
        </div>
      </div>
    );
  }

  if (order.status !== 'PENDING') {
    return (
      <div className="space-y-4 py-6 text-center">
        <p className="font-semibold">
          Order ini sudah diproses ({ORDER_STATUS_LABEL[order.status]}).
        </p>
        <p className="text-sm text-stone-500">
          Mungkin sudah di-approve admin lain atau dibatalkan staff.
        </p>
        <Button className="w-full" onClick={onClose}>
          Tutup
        </Button>
      </div>
    );
  }

  if (rejecting) {
    return (
      <div className="space-y-4">
        <Field label="Alasan menolak" hint="Terlihat oleh staff/pelanggan">
          <Input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Stok habis, pesanan ganda, …"
          />
        </Field>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setRejecting(false)}>
            Kembali
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={reason.trim().length < 3}
            loading={reject.isPending}
            onClick={() => reject.mutate()}
          >
            Tolak order
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <SourceBadge order={order} />
        <span className="font-medium">{order.customerName ?? 'Tanpa nama'}</span>
        <span className="text-stone-500">· oleh {order.createdBy?.name ?? 'pelanggan'}</span>
      </div>
      {order.note && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Catatan: {order.note}
        </p>
      )}

      {/* Item (bisa dikoreksi) */}
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
        {order.items.map((i) => {
          const q = qty[i.id] ?? 0;
          return (
            <li
              key={i.id}
              className={cn('flex items-center gap-2 px-3 py-2', q === 0 && 'opacity-40')}
            >
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  {i.productName} {i.packSize}pcs
                </p>
                <p className="text-xs text-stone-500">
                  {categoryLabel(i.categoryCode)} · {formatRupiah(i.price)}
                </p>
              </div>
              <button
                aria-label="Kurangi"
                onClick={() => setQty({ ...qty, [i.id]: Math.max(0, q - 1) })}
                className="flex size-8 items-center justify-center rounded-lg border border-stone-300"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-6 text-center text-sm font-semibold">{q}</span>
              <button
                aria-label="Tambah"
                onClick={() => setQty({ ...qty, [i.id]: q + 1 })}
                className="flex size-8 items-center justify-center rounded-lg border border-stone-300"
              >
                <Plus className="size-4" />
              </button>
              <span className="w-20 text-right text-sm tabular-nums">
                {formatRupiah(q * i.price)}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Diskon */}
      <div className="flex items-end gap-2">
        <Field label="Diskon (opsional)" className="flex-1">
          {discountMode === 'rp' ? (
            <MoneyInput value={discountInput} onChange={setDiscountInput} />
          ) : (
            <Input
              type="number"
              min={0}
              max={100}
              value={discountInput}
              onChange={(e) =>
                setDiscountInput(e.target.value === '' ? '' : Number(e.target.value))
              }
              placeholder="%"
            />
          )}
        </Field>
        <div className="flex rounded-lg bg-stone-100 p-1 text-sm">
          {(['rp', 'pct'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setDiscountMode(m);
                setDiscountInput('');
              }}
              className={cn('rounded-md px-3 py-1', discountMode === m && 'bg-white shadow-sm')}
            >
              {m === 'rp' ? 'Rp' : '%'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1 rounded-xl bg-stone-50 p-3 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatRupiah(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-stone-600">
            <span>Diskon</span>
            <span>-{formatRupiah(discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span>{formatRupiah(total)}</span>
        </div>
      </div>

      {/* Metode bayar */}
      <div>
        <p className="mb-2 text-sm font-medium">Metode bayar</p>
        <div className="grid grid-cols-3 gap-2">
          {(methods.data ?? []).map((m: PaymentMethodView) => (
            <button
              key={m.id}
              onClick={() => {
                setMethodId(m.id);
                setPaid('');
              }}
              className={cn(
                'rounded-xl border px-2 py-3 text-sm font-semibold',
                methodId === m.id
                  ? 'border-brand-700 bg-brand-50 text-brand-700'
                  : 'border-stone-300 bg-white',
              )}
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>

      {isCash && (
        <div className="space-y-2">
          <Field label="Uang diterima">
            <MoneyInput autoFocus value={paid} onChange={setPaid} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {quickCashAmounts(total).map((v) => (
              <button
                key={v}
                onClick={() => setPaid(v)}
                className="rounded-full border border-stone-300 bg-white px-3 py-1 text-sm"
              >
                {v === total ? 'Uang pas' : formatRupiah(v)}
              </button>
            ))}
          </div>
          {paid !== '' && (
            <p
              className={cn(
                'text-sm font-semibold',
                change < 0 ? 'text-red-600' : 'text-green-700',
              )}
            >
              {change < 0 ? `Kurang ${formatRupiah(-change)}` : `Kembalian ${formatRupiah(change)}`}
            </p>
          )}
        </div>
      )}
      {method && method.type !== 'CASH' && (
        <div className="space-y-2">
          {method.accountInfo && <p className="text-sm text-stone-600">{method.accountInfo}</p>}
          {method.type === 'QRIS' && settings.data?.qrisImageUrl && !order.paymentProofUrl && (
            <img
              src={assetUrl(settings.data.qrisImageUrl)}
              alt="QRIS toko"
              className="mx-auto max-h-64 rounded-xl border"
            />
          )}
          {order.paymentProofUrl && (
            <a href={assetUrl(order.paymentProofUrl)} target="_blank" rel="noreferrer">
              <p className="mb-1 text-xs font-semibold text-stone-500">
                Bukti bayar dari pelanggan — cek mutasi sebelum approve
              </p>
              <img
                src={assetUrl(order.paymentProofUrl)}
                alt="Bukti bayar"
                className="max-h-64 rounded-xl border"
              />
            </a>
          )}
          <Field label="Referensi (opsional)">
            <Input
              value={paymentRef}
              maxLength={60}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="No. referensi / 4 digit terakhir"
            />
          </Field>
        </div>
      )}

      <div className="flex gap-2 border-t border-stone-100 pt-4">
        <Button variant="outline" className="text-red-600" onClick={() => setRejecting(true)}>
          Tolak
        </Button>
        <Button
          className="flex-1"
          size="lg"
          disabled={invalid}
          loading={approve.isPending}
          onClick={() => approve.mutate()}
        >
          <Printer className="size-4" /> Approve & Print
        </Button>
      </div>
    </div>
  );
}
