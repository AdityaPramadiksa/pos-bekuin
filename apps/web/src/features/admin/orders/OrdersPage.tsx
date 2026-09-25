import { formatRupiah } from '@bekuin/shared';
import { ChefHat, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { OrderCard } from '@/features/orders/OrderCard';
import { OrderDetailDialog } from '@/features/orders/OrderDetailDialog';
import { dateKeyWita } from '@/features/orders/order-format';
import { ApproveDialog } from '@/features/admin/approval/ApproveDialog';
import { Chips } from '@/components/ui/chips';
import { useOrders, usePaymentMethods } from '@/lib/queries';

const STATUSES = [
  { key: '', label: 'Semua' },
  { key: 'PENDING', label: 'Menunggu' },
  { key: 'PAID', label: 'Lunas' },
  { key: 'REJECTED,CANCELLED', label: 'Batal/Ditolak' },
  { key: 'VOIDED', label: 'Void' },
];

export function OrdersPage() {
  const [from, setFrom] = useState(dateKeyWita(0));
  const [to, setTo] = useState(dateKeyWita(0));
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const methods = usePaymentMethods(true);
  const orders = useOrders({ from, to, status, source, paymentMethodId, q: q.trim(), limit: 200 });
  const paidTotal = (orders.data?.items ?? [])
    .filter((o) => o.status === 'PAID')
    .reduce((s, o) => s + o.total, 0);

  return (
    <>
      <PageHeader
        title="Order"
        subtitle="Semua transaksi"
        action={
          <div className="flex gap-2">
            <Link to="/admin/order/dapur">
              <Button variant="outline" size="sm">
                <ChefHat className="size-4" /> Dapur
              </Button>
            </Link>
            <Link to="/admin/order/baru">
              <Button size="sm">
                <Plus className="size-4" /> Buat Order
              </Button>
            </Link>
          </div>
        }
      />
      <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input
            type="date"
            aria-label="Dari"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
          <Input
            type="date"
            aria-label="Sampai"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
          <Select aria-label="Sumber" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Semua sumber</option>
            <option value="POS">POS</option>
            <option value="ADMIN">Admin</option>
            <option value="QR_TABLE">QR Meja</option>
            <option value="WA_IMPORT">WhatsApp</option>
          </Select>
          <Select
            aria-label="Metode bayar"
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
          >
            <option value="">Semua metode</option>
            {(methods.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
          <Input
            className="pl-9"
            placeholder="Cari nomor order / nama pelanggan"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Chips options={STATUSES} value={status} onChange={setStatus} />

        {orders.isPending ? (
          <LoadingState />
        ) : orders.isError ? (
          <ErrorState error={orders.error} onRetry={() => orders.refetch()} />
        ) : orders.data.items.length === 0 ? (
          <EmptyState title="Tidak ada transaksi" description="Ubah tanggal atau filter." />
        ) : (
          <>
            <p className="text-sm text-stone-600">
              {orders.data.total} order · lunas <b>{formatRupiah(paidTotal)}</b>
            </p>
            <ul className="space-y-2">
              {orders.data.items.map((o) => (
                <li key={o.id}>
                  <OrderCard order={o} onClick={() => setSelected(o.id)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <OrderDetailDialog
        orderId={selected}
        onClose={() => setSelected(null)}
        onProcess={(o) => {
          setSelected(null);
          setProcessing(o.id);
        }}
      />
      <ApproveDialog orderId={processing} onClose={() => setProcessing(null)} />
    </>
  );
}
