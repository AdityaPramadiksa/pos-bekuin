import { formatRupiah, ORDER_STATUS_LABEL, ORDER_TYPE_LABEL, type OrderView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer, Receipt } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { ReceiptPreview } from '@/features/printer/ReceiptPreview';
import { printReceipt } from '@/features/printer/receipt';
import { api, assetUrl, errorMessage } from '@/lib/api';
import { useOrder, useSettings } from '@/lib/queries';
import { useAuthStore } from '@/stores/auth';
import { FulfillmentBadge, SourceBadge, StatusBadge } from './order-ui';
import { categoryLabel, formatDateKey, formatDateTime } from './order-format';

const ACTION_LABEL: Record<string, string> = {
  CREATED: 'Dibuat',
  EDITED: 'Diubah',
  APPROVED: 'Disetujui & dibayar',
  REJECTED: 'Ditolak',
  CANCELLED: 'Dibatalkan',
  VOIDED: 'Void',
  FULFILLMENT: 'Status penyiapan',
  PROOF_UPLOADED: 'Bukti bayar diunggah',
};

export function OrderDetailDialog({
  orderId,
  onClose,
  onProcess,
  extraActions,
}: {
  orderId: string | null;
  onClose: () => void;
  /** Admin: buka dialog pembayaran untuk order PENDING. */
  onProcess?: (order: OrderView) => void;
  extraActions?: (order: OrderView) => React.ReactNode;
}) {
  const order = useOrder(orderId);
  const settings = useSettings();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [showReceipt, setShowReceipt] = useState(false);
  const isAdmin = user?.role === 'ADMIN';

  const cancel = useMutation({
    mutationFn: () => api.post(`/orders/${orderId}/cancel`, {}),
    onSuccess: () => {
      toast.success('Order dibatalkan');
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const reprint = useMutation({
    mutationFn: () => printReceipt(order.data!, settings.data!, { reprint: true }),
    onSuccess: () => toast.success('Struk dicetak'),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Gagal mencetak'),
  });

  const o = order.data;
  const canCancel = o?.status === 'PENDING' && (isAdmin || o.createdBy?.id === user?.id);

  return (
    <Dialog
      open={!!orderId}
      onClose={onClose}
      size="lg"
      title={o ? o.orderNo : 'Detail order'}
      description={
        o ? `${ORDER_STATUS_LABEL[o.status]} · ${formatDateTime(o.createdAt)}` : undefined
      }
      footer={
        o && (
          <>
            {canCancel && (
              <Button
                variant="outline"
                className="text-red-600"
                loading={cancel.isPending}
                onClick={() => window.confirm('Batalkan order ini?') && cancel.mutate()}
              >
                Batalkan
              </Button>
            )}
            {isAdmin && o.status === 'PENDING' && onProcess && (
              <Button onClick={() => onProcess(o)}>Proses pembayaran</Button>
            )}
            {isAdmin && (o.status === 'PAID' || o.status === 'VOIDED') && settings.data && (
              <Button
                variant="outline"
                loading={reprint.isPending}
                onClick={() => reprint.mutate()}
              >
                <Printer className="size-4" /> Cetak ulang
              </Button>
            )}
            {extraActions?.(o)}
          </>
        )
      }
    >
      {order.isPending ? (
        <LoadingState rows={3} />
      ) : order.isError ? (
        <ErrorState error={order.error} onRetry={() => order.refetch()} />
      ) : (
        o && (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge status={o.status} />
              <SourceBadge order={o} />
              {o.status === 'PAID' && <FulfillmentBadge status={o.fulfillmentStatus} />}
              <span className="text-xs text-stone-500">{ORDER_TYPE_LABEL[o.type]}</span>
            </div>

            <dl className="grid grid-cols-[7rem_1fr] gap-y-1">
              <dt className="text-stone-500">Pelanggan</dt>
              <dd>
                {o.customerName ?? '-'}
                {o.customerPhone ? ` · ${o.customerPhone}` : ''}
              </dd>
              {o.table && (
                <>
                  <dt className="text-stone-500">Meja</dt>
                  <dd>{o.table.name}</dd>
                </>
              )}
              <dt className="text-stone-500">Tanggal kirim</dt>
              <dd>{formatDateKey(o.deliveryDate)}</dd>
              <dt className="text-stone-500">Dibuat oleh</dt>
              <dd>{o.createdBy?.name ?? 'Pelanggan (QR)'}</dd>
              {o.approvedBy && (
                <>
                  <dt className="text-stone-500">Disetujui</dt>
                  <dd>
                    {o.approvedBy.name} · {formatDateTime(o.approvedAt!)}
                  </dd>
                </>
              )}
              {o.paymentMethod && (
                <>
                  <dt className="text-stone-500">Pembayaran</dt>
                  <dd>
                    {o.paymentMethod.name}
                    {o.changeAmount ? ` · kembali ${formatRupiah(o.changeAmount)}` : ''}
                    {o.paymentRef ? ` · ref ${o.paymentRef}` : ''}
                  </dd>
                </>
              )}
              {o.note && (
                <>
                  <dt className="text-stone-500">Catatan</dt>
                  <dd>{o.note}</dd>
                </>
              )}
              {o.reason && (
                <>
                  <dt className="text-stone-500">Alasan</dt>
                  <dd className="text-red-700">{o.reason}</dd>
                </>
              )}
            </dl>

            <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
              {o.items.map((i) => (
                <li key={i.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {i.productName} {i.packSize}pcs
                    </p>
                    <p className="text-xs text-stone-500">
                      {categoryLabel(i.categoryCode)} · {i.qty} × {formatRupiah(i.price)}
                      {i.note ? ` · ${i.note}` : ''}
                    </p>
                  </div>
                  <span className="font-medium tabular-nums">{formatRupiah(i.subtotal)}</span>
                </li>
              ))}
              {o.discount > 0 && (
                <li className="flex justify-between px-3 py-2 text-stone-600">
                  <span>Diskon</span>
                  <span>-{formatRupiah(o.discount)}</span>
                </li>
              )}
              <li className="flex justify-between px-3 py-2 font-bold">
                <span>Total</span>
                <span>{formatRupiah(o.total)}</span>
              </li>
              {isAdmin && o.status === 'PAID' && o.hppTotal !== null && (
                <li className="flex justify-between px-3 py-2 text-xs text-stone-500">
                  <span>HPP · laba kotor</span>
                  <span>
                    {formatRupiah(o.hppTotal)} · {formatRupiah(o.total - o.hppTotal)}
                  </span>
                </li>
              )}
            </ul>

            {o.paymentProofUrl && (
              <a
                href={assetUrl(o.paymentProofUrl)}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <p className="mb-1 text-xs font-semibold text-stone-500">Bukti bayar pelanggan</p>
                <img
                  src={assetUrl(o.paymentProofUrl)}
                  alt="Bukti bayar"
                  className="max-h-72 rounded-xl border"
                />
              </a>
            )}

            {isAdmin && settings.data && (
              <div>
                <button
                  className="flex items-center gap-1 text-xs font-medium text-stone-600"
                  onClick={() => setShowReceipt((v) => !v)}
                >
                  <Receipt className="size-4" /> {showReceipt ? 'Sembunyikan' : 'Lihat'} struk
                </button>
                {showReceipt && (
                  <div className="mt-2">
                    <ReceiptPreview order={o} store={settings.data} />
                  </div>
                )}
              </div>
            )}

            {o.logs && o.logs.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-stone-500">Riwayat</p>
                <ol className="space-y-1 border-l-2 border-stone-200 pl-3 text-xs">
                  {o.logs.map((l) => (
                    <li key={l.id}>
                      <span className="font-medium">{ACTION_LABEL[l.action] ?? l.action}</span>
                      {l.reason ? ` — ${l.reason}` : ''}
                      <span className="text-stone-500">
                        {' '}
                        · {l.userName ?? '-'} · {formatDateTime(l.createdAt)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )
      )}
    </Dialog>
  );
}
