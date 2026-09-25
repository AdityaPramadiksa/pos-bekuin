import { formatRupiah, type OrderView, quickCashAmounts } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { useCurrentShift, usePaymentMethods } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** Order COD / bayar saat ambil: catat uang yang diterima (cash masuk shift kasir). */
export function MarkPaidDialog({
  order,
  onClose,
}: {
  order: OrderView | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!order}
      onClose={onClose}
      title={order ? `Terima pembayaran ${order.customerName ?? order.orderNo}` : ''}
    >
      {order && <MarkPaidForm key={order.id} order={order} onClose={onClose} />}
    </Dialog>
  );
}

function MarkPaidForm({ order, onClose }: { order: OrderView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const methods = usePaymentMethods();
  const shift = useCurrentShift();
  const [methodId, setMethodId] = useState(order.paymentMethod?.id ?? null);
  const [paid, setPaid] = useState<number | ''>('');
  const [paymentRef, setPaymentRef] = useState('');
  const method = methods.data?.find((m) => m.id === methodId) ?? null;
  const isCash = method?.type === 'CASH';
  const noShift = isCash && shift.isSuccess && !shift.data;
  const change = isCash && paid !== '' ? paid - order.total : 0;
  const invalid = !method || noShift || (isCash && (paid === '' || paid < order.total));

  const save = useMutation({
    mutationFn: () =>
      api.post<OrderView>(`/orders/${order.id}/mark-paid`, {
        paymentMethodId: methodId,
        paidAmount: isCash ? paid : undefined,
        paymentRef: paymentRef.trim() || null,
      }),
    onSuccess: ({ data }) => {
      toast.success(
        data.changeAmount
          ? `Lunas. Kembalian ${formatRupiah(data.changeAmount)}`
          : `${data.orderNo} lunas`,
        { duration: 8000 },
      );
      void queryClient.invalidateQueries({ queryKey: ['processing'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error), { duration: 8000 }),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-stone-50 p-3 text-center">
        <p className="text-sm text-stone-500">Tagihan {order.orderNo}</p>
        <p className="text-3xl font-bold">{formatRupiah(order.total)}</p>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Dibayar dengan</p>
        <div className="grid grid-cols-3 gap-2">
          {(methods.data ?? []).map((m) => (
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
      {noShift && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Belum ada shift kasir yang terbuka. Uang cash harus masuk shift.{' '}
          <Link to="/admin/lainnya/keuangan" className="font-semibold underline" onClick={onClose}>
            Buka shift
          </Link>
        </div>
      )}
      {isCash && !noShift && (
        <div className="space-y-2">
          <Field label="Uang diterima">
            <MoneyInput autoFocus value={paid} onChange={setPaid} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {quickCashAmounts(order.total).map((v) => (
              <button
                key={v}
                onClick={() => setPaid(v)}
                className="rounded-full border border-stone-300 bg-white px-3 py-1 text-sm"
              >
                {v === order.total ? 'Uang pas' : formatRupiah(v)}
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
      {method && !isCash && (
        <Field label="Referensi (opsional)">
          <Input
            value={paymentRef}
            maxLength={60}
            onChange={(e) => setPaymentRef(e.target.value)}
            placeholder="No. referensi / 4 digit terakhir"
          />
        </Field>
      )}
      <Button
        className="w-full"
        size="lg"
        disabled={invalid}
        loading={save.isPending}
        onClick={() => save.mutate()}
      >
        Sudah dibayar
      </Button>
    </div>
  );
}
