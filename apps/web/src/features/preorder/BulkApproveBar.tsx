import { formatRupiah, type OrderView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Printer, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/input';
import { printReceipt } from '@/features/printer/receipt';
import { api, errorMessage } from '@/lib/api';
import { usePaymentMethods, useSettings } from '@/lib/queries';

interface BulkResult {
  results: { id: string; orderNo: string; ok: boolean; message: string | null; total: number }[];
  succeeded: number;
  failed: number;
}

/** Bar bawah untuk approve massal order yang dicentang (satu metode bayar untuk semua). */
export function BulkApproveBar({
  selected,
  onDone,
}: {
  selected: OrderView[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const methods = usePaymentMethods();
  const settings = useSettings();
  const nonCash = (methods.data ?? []).filter((m) => m.type !== 'CASH');
  const [methodId, setMethodId] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);
  const total = selected.reduce((s, o) => s + o.total, 0);

  const approve = useMutation({
    mutationFn: async () =>
      (
        await api.post<BulkResult>('/orders/bulk-approve', {
          orderIds: selected.map((o) => o.id),
          paymentMethodId: methodId || nonCash[0]?.id,
        })
      ).data,
    onSuccess: (data) => {
      setResult(data);
      for (const key of ['orders', 'order', 'reports', 'stock', 'catalog', 'kitchen'])
        void queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const printAll = useMutation({
    mutationFn: async () => {
      for (const r of result!.results.filter((x) => x.ok)) {
        const order = (await api.get<OrderView>(`/orders/${r.id}`)).data;
        await printReceipt(order, settings.data!);
      }
    },
    onSuccess: () => toast.success('Semua struk dicetak'),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Gagal mencetak'),
  });

  if (selected.length === 0 && !result) return null;
  return (
    <>
      {selected.length > 0 && (
        <div className="pb-safe fixed inset-x-0 bottom-16 z-20 border-t border-stone-200 bg-white px-4 py-3 shadow-lg md:bottom-0 md:left-56">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2">
            <p className="text-sm">
              <b>{selected.length} order</b> · {formatRupiah(total)}
            </p>
            <Select
              aria-label="Metode bayar"
              className="ml-auto w-40"
              value={methodId || nonCash[0]?.id || ''}
              onChange={(e) => setMethodId(e.target.value)}
            >
              {nonCash.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
            <Button loading={approve.isPending} onClick={() => approve.mutate()}>
              Approve massal
            </Button>
          </div>
          <p className="mx-auto mt-1 max-w-3xl text-xs text-stone-500">
            Metode ini untuk order staff/WA; order pelanggan QR memakai cara bayar pilihannya. Cash
            yang perlu kembalian: approve satu per satu.
          </p>
        </div>
      )}
      <Dialog
        open={!!result}
        onClose={() => {
          setResult(null);
          onDone();
        }}
        title={`Approve massal: ${result?.succeeded ?? 0} berhasil, ${result?.failed ?? 0} gagal`}
        footer={
          <>
            <Button
              variant="outline"
              disabled={!result?.succeeded}
              loading={printAll.isPending}
              onClick={() => printAll.mutate()}
            >
              <Printer className="size-4" /> Cetak semua yang berhasil
            </Button>
            <Button
              onClick={() => {
                setResult(null);
                onDone();
              }}
            >
              Selesai
            </Button>
          </>
        }
      >
        <ul className="divide-y divide-stone-100 text-sm">
          {result?.results.map((r) => (
            <li key={r.id} className="flex items-start gap-2 py-2">
              {r.ok ? (
                <CheckCircle2 className="size-4 text-green-600" />
              ) : (
                <XCircle className="size-4 text-red-600" />
              )}
              <div className="flex-1">
                <p className="font-medium">{r.orderNo}</p>
                {r.message && <p className="text-xs text-red-700">{r.message}</p>}
              </div>
              <span>{formatRupiah(r.total)}</span>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}
