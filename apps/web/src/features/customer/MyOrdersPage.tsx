import {
  formatRupiah,
  ORDER_STAGE_LABEL,
  orderStage,
  type PublicOrderSummary,
} from '@bekuin/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, History, ImageUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { formatDateKey, formatDateTime } from '@/features/orders/order-format';
import { publicApi } from '@/lib/api';
import { loadMyOrders } from './my-orders';

const stageOf = (o: PublicOrderSummary) => {
  const source = o.delivery ? 'ONLINE' : 'QR_TABLE';
  const deliveryMethod = o.delivery?.method ?? null;
  return orderStage({ ...o, source, deliveryMethod });
};

const TONE: Record<string, 'amber' | 'blue' | 'green' | 'red' | 'neutral'> = {
  PENDING: 'amber',
  PROCESSING: 'blue',
  SHIPPED: 'green',
  READY_PICKUP: 'green',
  DONE: 'green',
  REJECTED: 'red',
  CANCELLED: 'neutral',
  VOIDED: 'red',
};

/**
 * Riwayat pesanan pelanggan tanpa akun: daftar pesanan yang pernah dibuat dari HP/browser ini
 * (token disimpan lokal), status terbarunya diambil dari server.
 */
export function MyOrdersPage() {
  const mine = loadMyOrders();
  const tokens = mine.map((o) => o.publicToken);
  const orders = useQuery({
    queryKey: ['my-orders', tokens],
    queryFn: async () =>
      (await publicApi.post<PublicOrderSummary[]>('/public/orders/lookup', { tokens })).data,
    enabled: tokens.length > 0,
    refetchInterval: 30_000,
  });
  const menuPath = mine.find((o) => o.menuPath)?.menuPath;

  return (
    <div className="bg-cream mx-auto min-h-dvh max-w-md pb-10">
      <header className="bg-brand-700 px-4 pt-5 pb-4 text-white">
        <h1 className="flex items-center gap-2 text-lg font-bold">
          <History className="size-5" /> Riwayat pesanan
        </h1>
        <p className="text-sm text-white/80">Pesanan yang pernah kamu buat dari HP ini</p>
      </header>
      <div className="space-y-3 p-4">
        {tokens.length === 0 ? (
          <EmptyState
            title="Belum ada pesanan di HP ini"
            description="Pesanan yang kamu buat lewat link order akan muncul di sini."
          />
        ) : orders.isPending ? (
          <LoadingState rows={4} />
        ) : orders.isError ? (
          <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
        ) : orders.data.length === 0 ? (
          <EmptyState title="Pesanan tidak ditemukan" />
        ) : (
          <ul className="space-y-2">
            {orders.data.map((o) => {
              const stage = stageOf(o);
              return (
                <li key={o.publicToken}>
                  <Link
                    to={`/o/${o.publicToken}`}
                    className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold">{o.orderNo}</span>
                        <Badge tone={TONE[stage]}>
                          {stage === 'PENDING' && o.hasPaymentProof
                            ? 'Bukti dicek admin'
                            : ORDER_STAGE_LABEL[stage]}
                        </Badge>
                      </div>
                      <p className="line-clamp-2 text-sm text-stone-600">{o.itemsSummary}</p>
                      <p className="text-xs text-stone-500">
                        {formatDateTime(o.createdAt)}
                        {o.delivery
                          ? ` · ${o.delivery.method === 'DELIVERY' ? 'Antar' : 'Ambil'} ${formatDateKey(o.delivery.date)}`
                          : o.tableName
                            ? ` · ${o.tableName}`
                            : ''}
                      </p>
                      {o.needsProof && (
                        <p className="flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <ImageUp className="size-3.5" /> Belum unggah bukti bayar
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold tabular-nums">{formatRupiah(o.total)}</p>
                      <p className="text-xs text-stone-500">
                        {o.status === 'PAID'
                          ? o.isPaid
                            ? 'Lunas'
                            : 'Bayar saat terima'
                          : (o.paymentMethodName ?? '')}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-stone-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {menuPath && (
          <Link to={menuPath} className="block">
            <Button size="lg" className="w-full">
              Pesan lagi
            </Button>
          </Link>
        )}
        <p className="text-center text-xs text-stone-500">
          Riwayat tersimpan di browser HP ini selama 90 hari. Ganti HP atau hapus data browser =
          riwayat hilang, tapi pesanannya tetap tercatat di toko.
        </p>
      </div>
    </div>
  );
}
