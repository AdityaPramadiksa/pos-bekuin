import {
  formatRupiah,
  ORDER_STATUS_LABEL,
  type OrderView,
  type PaymentMethodView,
  qrisWithAmount,
  quickCashAmounts,
} from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Minus, Plus, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { QrisCode } from '@/components/QrisCode';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { DeliveryInfo } from '@/features/orders/DeliveryInfo';
import { SourceBadge } from '@/features/orders/order-ui';
import { categoryLabel } from '@/features/orders/order-format';
import { isPrinterConnected, printReceipt } from '@/features/printer/receipt';
import { api, assetUrl, errorMessage } from '@/lib/api';
import { useCurrentShift, useOrder, usePaymentMethods, useSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** QRIS bernominal untuk dibayar pelanggan langsung di kasir (null bila QRIS toko belum diatur). */
function counterQris(payload: string | null, amount: number): string | null {
  if (!payload || amount < 1) return null;
  try {
    return qrisWithAmount(payload, amount);
  } catch {
    return null;
  }
}

/** Isi pesanan pelanggan QR: hanya dibaca (sudah final dan dibayar sesuai total). */
function CustomerItems({ order }: { order: OrderView }) {
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
        {order.items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <span className="w-8 font-semibold tabular-nums">{i.qty}×</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {i.productName} {i.packSize}pcs
              </p>
              <p className="text-xs text-stone-500">
                {categoryLabel(i.categoryCode)} · {formatRupiah(i.price)}
              </p>
            </div>
            <span className="tabular-nums">{formatRupiah(i.qty * i.price)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-stone-500">
        Pesanan dari pelanggan tidak bisa diubah. Bila ada item yang habis, tolak dengan alasan agar
        pelanggan memesan ulang.
      </p>
    </div>
  );
}

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
      title={order.data ? `Proses ${order.data.orderNo}` : 'Proses order'}
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
  const shift = useCurrentShift();
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
  // Ongkir pesanan online ikut ditagih (tidak kena diskon).
  const total = Math.max(0, subtotal - discount) + order.deliveryFee;
  // Order pelanggan QR sudah final: isi & diskon dikunci, cara bayar dari pilihan pelanggan.
  const isCustomerOrder = order.source === 'QR_TABLE' || order.source === 'ONLINE';
  const [changingMethod, setChangingMethod] = useState(false);
  // Uang belum diterima: COD / bayar saat ambil (order tetap diproses, ditandai lunas nanti).
  const [payLater, setPayLater] = useState(order.source === 'ONLINE' && order.payAtCashier);
  const selectedMethodId = methodId ?? order.paymentMethod?.id ?? null;
  const method = methods.data?.find((m) => m.id === selectedMethodId) ?? null;
  const isCash = method?.type === 'CASH';
  const change = isCash && paid !== '' ? paid - total : 0;
  const itemCount = Object.values(qty).filter((q) => q > 0).length;
  // Cash masuk laci → wajib ada shift kasir terbuka (dicek juga di server).
  const noShift = isCash && !payLater && shift.isSuccess && !shift.data;
  // Nominal yang harus masuk untuk QRIS pelanggan (total + kode unik).
  const expectedQris =
    method?.type === 'QRIS' && order.uniqueCode && method.id === order.paymentMethod?.id
      ? order.total + order.uniqueCode
      : null;
  const qrisForCounter = counterQris(settings.data?.qrisPayload ?? null, total);
  const invalid =
    !method ||
    itemCount === 0 ||
    discount > subtotal ||
    noShift ||
    (isCash && !payLater && (paid === '' || paid < total));

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
          paymentMethodId: selectedMethodId,
          paidAmount: isCash && !payLater ? paid : undefined,
          payLater: payLater || undefined,
          discount,
          paymentRef: paymentRef.trim() || null,
          items: items.length ? items : undefined,
        })
      ).data;
    },
    onSuccess: async (paidOrder) => {
      refresh();
      setDone(paidOrder);
      // Order tetap diproses walau printer gagal; tombol cetak ulang tersedia.
      if (settings.data && isPrinterConnected()) {
        try {
          await printReceipt(paidOrder, settings.data);
          toast.success('Diproses & struk dicetak');
        } catch (error) {
          toast.error(
            `Diproses, tapi struk gagal dicetak: ${error instanceof Error ? error.message : ''}`,
          );
        }
      } else {
        toast.success('Order diproses. Printer belum terhubung — cetak dari tombol di bawah.');
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
          <p className="text-lg font-bold">
            Diproses · {done.paidAt ? 'Lunas' : 'Belum dibayar'} {formatRupiah(done.total)}
          </p>
          <p className="text-sm text-stone-500">
            {done.orderNo} · {done.paymentMethod?.name}
            {done.paidAt ? '' : ' · tandai lunas di halaman Diproses saat uang diterima'}
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
          Order ini sudah tidak menunggu ({ORDER_STATUS_LABEL[order.status]}).
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
      <DeliveryInfo order={order} />
      {order.note && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Catatan: {order.note}
        </p>
      )}

      {isCustomerOrder ? (
        <CustomerItems order={order} />
      ) : (
        <>
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
        </>
      )}

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
        {order.deliveryFee > 0 && (
          <div className="flex justify-between text-stone-600">
            <span>Ongkir</span>
            <span>{formatRupiah(order.deliveryFee)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold">
          <span>Total</span>
          <span>{formatRupiah(total)}</span>
        </div>
      </div>

      {order.paymentProofUrl && (
        <a
          href={assetUrl(order.paymentProofUrl)}
          target="_blank"
          rel="noreferrer"
          className="block rounded-xl bg-green-50 p-3"
        >
          <p className="mb-2 text-xs font-semibold text-green-900">
            Bukti bayar dari pelanggan — cocokkan dengan mutasi QRIS/rekening sebelum approve
          </p>
          <img
            src={assetUrl(order.paymentProofUrl)}
            alt="Bukti bayar"
            className="max-h-72 rounded-lg border bg-white"
          />
        </a>
      )}
      {/* Metode bayar: order pelanggan memakai pilihannya, admin cukup mengecek. */}
      {isCustomerOrder && method && !changingMethod ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 px-3 py-2.5">
          <div>
            <p className="text-xs text-stone-500">Dibayar pelanggan dengan</p>
            <p className="font-semibold">{method.name}</p>
          </div>
          <button
            className="text-xs font-medium text-stone-500 underline"
            onClick={() => setChangingMethod(true)}
          >
            Pelanggan ganti cara bayar?
          </button>
        </div>
      ) : (
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
                  selectedMethodId === m.id
                    ? 'border-brand-700 bg-brand-50 text-brand-700'
                    : 'border-stone-300 bg-white',
                )}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Kapan uang diterima: sekarang, atau nanti (COD / bayar saat ambil / ditagih). */}
      {method && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 text-sm">
          {[
            { later: false, label: 'Sudah dibayar' },
            { later: true, label: 'Bayar nanti (COD)' },
          ].map((o) => (
            <button
              key={o.label}
              onClick={() => setPayLater(o.later)}
              className={cn(
                'rounded-lg px-2 py-2 font-medium',
                payLater === o.later ? 'bg-white shadow-sm' : 'text-stone-600',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {payLater && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Order langsung <b>diproses</b> dengan status <b>belum dibayar</b>. Tekan{' '}
          <b>Sudah dibayar</b> di halaman Diproses saat uangnya diterima.
        </p>
      )}
      {expectedQris !== null && !payLater && (
        <div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
          <p>Cek notifikasi DANA / mutasi QRIS, harus masuk:</p>
          <p className="text-2xl font-bold">{formatRupiah(expectedQris)}</p>
          <p className="text-xs">
            Total {formatRupiah(order.total)} + kode unik {formatRupiah(order.uniqueCode ?? 0)}.
            Bila notifikasi DANA sudah tersambung, order ini diproses otomatis begitu uang masuk.
          </p>
        </div>
      )}

      {noShift && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Belum ada shift kasir yang terbuka. Buka shift dulu untuk menerima cash, atau pilih metode
          non-tunai.{' '}
          <Link to="/admin/lainnya/keuangan" className="font-semibold underline" onClick={onClose}>
            Buka shift
          </Link>
        </div>
      )}
      {isCash && !noShift && !payLater && (
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
      {method && method.type !== 'CASH' && !payLater && (
        <div className="space-y-2">
          {method.accountInfo && <p className="text-sm text-stone-600">{method.accountInfo}</p>}
          {/* Bayar QRIS langsung di kasir: tunjukkan QR bernominal ke pelanggan. */}
          {method.type === 'QRIS' &&
            !isCustomerOrder &&
            (qrisForCounter ? (
              <div className="rounded-xl bg-stone-50 p-3 text-center">
                <p className="mb-2 text-sm text-stone-600">
                  Minta pelanggan scan, nominal <b>{formatRupiah(total)}</b> sudah terisi
                </p>
                <QrisCode payload={qrisForCounter} filename={`qris-${order.orderNo}`} size={220} />
              </div>
            ) : (
              settings.data?.qrisImageUrl && (
                <img
                  src={assetUrl(settings.data.qrisImageUrl)}
                  alt="QRIS toko"
                  className="mx-auto max-h-64 rounded-xl border"
                />
              )
            ))}
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
          <Printer className="size-4" /> Proses & cetak struk
        </Button>
      </div>
    </div>
  );
}
