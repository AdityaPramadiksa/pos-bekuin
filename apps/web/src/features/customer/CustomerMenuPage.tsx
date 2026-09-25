import { formatRupiah, type PublicMenuResponse, type PublicOrderCreated } from '@bekuin/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Clock, Minus, Plus, ReceiptText, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { assetUrl, errorMessage, publicApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { cartTotals, getCartStore } from '@/stores/cart';
import { loadMyOrders, saveMyOrder } from './my-orders';
import { sortCustomerMethods } from './payment-methods';
import { PaymentChoice } from './PaymentChoice';

export function CustomerMenuPage() {
  const { qrToken = '' } = useParams();
  const menu = useQuery({
    queryKey: ['public-menu', qrToken],
    queryFn: async () =>
      (await publicApi.get<PublicMenuResponse>(`/public/tables/${qrToken}/menu`)).data,
    retry: false,
    refetchInterval: 60_000, // ketersediaan menu & status buka ikut diperbarui
  });

  if (menu.isPending) {
    return (
      <div className="mx-auto max-w-md p-4">
        <LoadingState rows={5} />
      </div>
    );
  }
  if (menu.isError) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
        <ErrorState error={menu.error} onRetry={() => menu.refetch()} />
      </div>
    );
  }
  return <Menu qrToken={qrToken} data={menu.data} />;
}

function Menu({ qrToken, data }: { qrToken: string; data: PublicMenuResponse }) {
  const navigate = useNavigate();
  const useCart = getCartStore(`qr-${qrToken}`);
  const { lines, meta, add, setQty, setMeta, clear } = useCart();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // Cara bayar: bawaan QRIS bila tersedia.
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(
    () => sortCustomerMethods(data.paymentMethods)[0]?.id ?? null,
  );
  // QR meja: bawaan makan di tempat.
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY'>('DINE_IN');
  const myOrders = loadMyOrders().filter((o) => o.qrToken === qrToken);

  const category = data.categories.find((c) => c.id === categoryId) ?? data.categories[0];
  const products = data.products.filter((p) =>
    p.variants.some((v) => v.categoryId === category?.id),
  );
  const totals = cartTotals(lines);
  const overLimit = totals.total > data.maxOrderTotal;
  const qtyOf = (variantId: string) => lines.find((l) => l.variantId === variantId)?.qty ?? 0;

  const submit = useMutation({
    mutationFn: async () =>
      (
        await publicApi.post<PublicOrderCreated>('/public/orders', {
          qrToken,
          items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
          customerName: meta.customerName.trim(),
          customerPhone: meta.customerPhone.trim() || null,
          type: data.table.isTakeaway ? 'TAKEAWAY' : orderType,
          note: meta.note.trim() || null,
          paymentMethodId,
        })
      ).data,
    onSuccess: (created) => {
      saveMyOrder({
        ...created,
        qrToken,
        tableName: data.table.name,
        createdAt: new Date().toISOString(),
      });
      clear();
      setMeta({ customerName: meta.customerName, customerPhone: meta.customerPhone }); // ingat nama untuk pesan lagi
      navigate(`/o/${created.publicToken}`);
    },
    onError: (error) => toast.error(errorMessage(error), { duration: 8000 }),
  });

  return (
    <div className="bg-cream mx-auto min-h-dvh max-w-md pb-28">
      <header className="bg-brand-700 px-4 pt-5 pb-4 text-white">
        <div className="flex items-center gap-3">
          {data.store.logoUrl ? (
            <img
              src={assetUrl(data.store.logoUrl)}
              alt=""
              className="size-12 rounded-xl bg-white object-cover"
            />
          ) : (
            <img src="/favicon.svg" alt="" className="size-12 rounded-xl" />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-lg leading-tight font-bold">{data.store.name}</h1>
            {data.store.tagline && <p className="text-xs text-white/80">{data.store.tagline}</p>}
          </div>
          <span className="text-brand-700 rounded-full bg-white px-3 py-1 text-sm font-bold">
            {data.table.name}
          </span>
        </div>
        {myOrders.length > 0 && (
          <Link
            to={`/o/${myOrders[0].publicToken}`}
            className="mt-3 flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm"
          >
            <ReceiptText className="size-4" /> Lihat status pesanan {myOrders[0].orderNo}
          </Link>
        )}
      </header>

      {!data.store.isOpen ? (
        <div className="m-4 rounded-2xl bg-white p-6 text-center shadow-sm">
          <Clock className="mx-auto size-10 text-stone-400" />
          <p className="mt-2 font-semibold">{data.store.closedReason}</p>
          <p className="mt-1 text-sm text-stone-500">Silakan pesan langsung di kasir.</p>
        </div>
      ) : (
        <>
          <nav className="bg-cream/95 sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-stone-200 px-4 py-3 backdrop-blur">
            {data.categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  'shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold',
                  category?.id === c.id
                    ? 'bg-brand-700 text-white'
                    : 'bg-white text-stone-700 ring-1 ring-stone-200',
                )}
              >
                {c.name}
              </button>
            ))}
          </nav>

          <ul className="space-y-3 p-4">
            {products.map((p) => (
              <li key={p.id} className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-stone-100 text-stone-400">
                  {p.imageUrl ? (
                    <img
                      src={assetUrl(p.imageUrl)}
                      alt={p.name}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <UtensilsCrossed className="size-7" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name}</p>
                  {p.description && (
                    <p className="line-clamp-2 text-xs text-stone-500">{p.description}</p>
                  )}
                  <ul className="mt-2 space-y-2">
                    {p.variants
                      .filter((v) => v.categoryId === category?.id)
                      .map((v) => {
                        const qty = qtyOf(v.id);
                        return (
                          <li key={v.id} className="flex items-center gap-2">
                            <div className="flex-1 text-sm">
                              <span className="font-medium">Isi {v.packSize}</span>
                              <span className="text-brand-700 ml-2 font-bold">
                                {formatRupiah(v.price)}
                              </span>
                            </div>
                            {!v.available ? (
                              <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-500">
                                Habis
                              </span>
                            ) : qty === 0 ? (
                              <button
                                onClick={() =>
                                  add({
                                    variantId: v.id,
                                    productId: p.id,
                                    productName: p.name,
                                    categoryId: v.categoryId,
                                    categoryCode: v.categoryCode,
                                    categoryName: category!.name,
                                    packSize: v.packSize,
                                    price: v.price,
                                  })
                                }
                                className="border-brand-700 text-brand-700 rounded-full border px-4 py-1 text-sm font-semibold"
                              >
                                Tambah
                              </button>
                            ) : (
                              <Stepper
                                qty={qty}
                                onChange={(q) => setQty(v.id, q)}
                                label={`${p.name} isi ${v.packSize}`}
                              />
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {data.store.isOpen && lines.length > 0 && (
        <div className="pb-safe fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md px-4 pb-3">
          <button
            onClick={() => setCheckoutOpen(true)}
            className="bg-brand-700 flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-white shadow-xl"
          >
            <ShoppingBag className="size-5" />
            <span className="text-sm">{totals.packs} item</span>
            <span className="ml-auto text-lg font-bold">{formatRupiah(totals.total)}</span>
            <span className="text-brand-700 rounded-lg bg-white px-3 py-1 text-sm font-bold">
              Pesan
            </span>
          </button>
        </div>
      )}

      <Dialog
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title="Pesanan kamu"
        description={data.table.name}
      >
        <div className="space-y-4">
          <ul className="divide-y divide-stone-100">
            {lines.map((l) => (
              <li key={l.variantId} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">
                    {l.productName} isi {l.packSize}
                  </p>
                  <p className="text-xs text-stone-500">
                    {l.categoryName} · {formatRupiah(l.price)}
                  </p>
                </div>
                <Stepper
                  qty={l.qty}
                  onChange={(q) => setQty(l.variantId, q)}
                  label={l.productName}
                />
              </li>
            ))}
          </ul>

          <Field label="Nama kamu" hint="Untuk memanggil saat pesanan siap">
            <Input
              value={meta.customerName}
              maxLength={40}
              autoComplete="name"
              onChange={(e) => setMeta({ customerName: e.target.value })}
            />
          </Field>
          <Field label="No. WhatsApp (opsional)">
            <Input
              inputMode="tel"
              value={meta.customerPhone}
              maxLength={20}
              onChange={(e) => setMeta({ customerPhone: e.target.value })}
            />
          </Field>
          {!data.table.isTakeaway && (
            <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
              {(['DINE_IN', 'TAKEAWAY'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={cn(
                    'flex-1 rounded-lg py-2 text-sm font-medium',
                    orderType === t ? 'bg-white shadow-sm' : 'text-stone-500',
                  )}
                >
                  {t === 'DINE_IN' ? 'Makan di sini' : 'Bawa pulang'}
                </button>
              ))}
            </div>
          )}
          <Field label="Catatan (opsional)">
            <Textarea
              className="min-h-14"
              value={meta.note}
              maxLength={150}
              onChange={(e) => setMeta({ note: e.target.value })}
              placeholder="Saos dipisah, dll."
            />
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium">Cara bayar</p>
            <PaymentChoice
              methods={data.paymentMethods}
              value={paymentMethodId}
              onChange={setPaymentMethodId}
            />
          </div>

          <div className="flex items-baseline justify-between border-t border-stone-100 pt-3">
            <span className="text-sm text-stone-600">Total</span>
            <span className="text-2xl font-bold">{formatRupiah(totals.total)}</span>
          </div>
          {overLimit && (
            <p className="text-sm text-red-600">
              Total melebihi batas {formatRupiah(data.maxOrderTotal)} untuk pesanan meja. Silakan
              pesan di kasir.
            </p>
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={
              lines.length === 0 ||
              meta.customerName.trim().length < 2 ||
              overLimit ||
              !paymentMethodId
            }
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            Pesan sekarang
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function Stepper({
  qty,
  onChange,
  label,
}: {
  qty: number;
  onChange: (qty: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        aria-label={`Kurangi ${label}`}
        onClick={() => onChange(qty - 1)}
        className="border-brand-700 text-brand-700 flex size-8 items-center justify-center rounded-full border"
      >
        <Minus className="size-4" />
      </button>
      <span className="w-6 text-center font-semibold tabular-nums">{qty}</span>
      <button
        aria-label={`Tambah ${label}`}
        onClick={() => onChange(Math.min(50, qty + 1))}
        className="bg-brand-700 flex size-8 items-center justify-center rounded-full text-white"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
