import { type CatalogProduct, formatRupiah, type OrderView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Search, ShoppingBasket, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { api, assetUrl, errorMessage } from '@/lib/api';
import { queryKeys, useCatalog } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { cartPcsByProduct, cartTotals, getCartStore } from '@/stores/cart';
import { CartPanel } from './CartPanel';

export function PosScreen({ onSubmitted }: { onSubmitted: (order: OrderView) => void }) {
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const role = useAuthStore((s) => s.user?.role);
  const useCart = getCartStore(`pos-${userId}`);
  const { lines, meta, add, setQty, clear } = useCart();
  const catalog = useCatalog();
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [cartOpen, setCartOpen] = useState(false);

  const categories = catalog.data?.categories ?? [];
  const activeCategory = categories.find((c) => c.id === categoryId) ?? categories[0];
  const cartPcs = cartPcsByProduct(lines);
  const totals = cartTotals(lines);

  const packsByCategory = new Map<string, number>();
  for (const l of lines) {
    packsByCategory.set(l.categoryId, (packsByCategory.get(l.categoryId) ?? 0) + l.qty);
  }

  const q = search.trim().toLowerCase();
  const products = (catalog.data?.products ?? []).filter(
    (p) =>
      p.variants.some((v) => v.categoryId === activeCategory?.id) &&
      (!q || p.name.toLowerCase().includes(q)),
  );

  const submit = useMutation({
    mutationFn: async () =>
      (
        await api.post<OrderView>('/orders', {
          items: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
          customerName: meta.customerName.trim() || null,
          customerPhone: meta.customerPhone.trim() || null,
          note: meta.note.trim() || null,
          type: meta.type,
          tableId: meta.type === 'DINE_IN' && meta.tableId ? meta.tableId : null,
          deliveryDate: meta.deliveryDate || undefined,
        })
      ).data,
    onSuccess: (order) => {
      clear();
      setCartOpen(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      onSubmitted(order);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
    },
  });

  const cartPanel = (
    <CartPanel
      cartKey={`pos-${userId}`}
      submitLabel={role === 'ADMIN' ? 'Lanjut ke Pembayaran' : 'Kirim ke Admin'}
      submitting={submit.isPending}
      onSubmit={() => submit.mutate()}
    />
  );

  if (catalog.isPending)
    return (
      <div className="p-4">
        <LoadingState rows={6} />
      </div>
    );
  if (catalog.isError)
    return (
      <div className="p-4">
        <ErrorState error={catalog.error} onRetry={() => catalog.refetch()} />
      </div>
    );

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] md:min-h-dvh">
      <div className="min-w-0 flex-1">
        {/* Toggle kategori + cari */}
        <div className="bg-cream/95 sticky top-0 z-10 space-y-2 border-b border-stone-200 px-4 pt-3 pb-3 backdrop-blur">
          <div className="flex gap-1 rounded-xl bg-stone-200/70 p-1">
            {categories.map((c) => {
              const count = packsByCategory.get(c.id) ?? 0;
              return (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  className={cn(
                    'flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                    activeCategory?.id === c.id
                      ? 'text-brand-700 bg-white shadow-sm'
                      : 'text-stone-600',
                  )}
                >
                  {c.name}
                  {count > 0 && (
                    <span className="bg-brand-700 ml-1 rounded-full px-1.5 text-xs text-white">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
            <Input
              placeholder="Cari menu…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="p-4 pb-28 md:pb-6">
          {products.length === 0 ? (
            <EmptyState
              title="Menu tidak ditemukan"
              description="Coba kategori lain atau ubah kata pencarian."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((p) => (
                <li key={p.id}>
                  <ProductTile
                    product={p}
                    categoryId={activeCategory!.id}
                    remainingPcs={p.availablePcs - (cartPcs.get(p.id) ?? 0)}
                    qtyOf={(variantId) => lines.find((l) => l.variantId === variantId)?.qty ?? 0}
                    onAdd={(variant) =>
                      add({
                        variantId: variant.id,
                        productId: p.id,
                        productName: p.name,
                        categoryId: variant.categoryId,
                        categoryCode: variant.categoryCode,
                        categoryName: activeCategory!.name,
                        packSize: variant.packSize,
                        price: variant.price,
                      })
                    }
                    onSetQty={setQty}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Tablet/desktop: panel keranjang tetap di kanan */}
      <aside className="sticky top-0 hidden h-dvh w-96 shrink-0 border-l border-stone-200 bg-white lg:block">
        {cartPanel}
      </aside>

      {/* HP: bar bawah + sheet keranjang */}
      <div className="fixed inset-x-0 bottom-16 z-20 px-3 pb-2 md:bottom-0 md:left-56 lg:hidden">
        <button
          disabled={lines.length === 0}
          onClick={() => setCartOpen(true)}
          className="bg-brand-700 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-lg disabled:bg-stone-400"
        >
          <ShoppingBasket className="size-5" />
          <span className="text-sm font-medium">{totals.packs} pack</span>
          <span className="ml-auto font-bold">{formatRupiah(totals.total)}</span>
          <span className="rounded-lg bg-white/20 px-2 py-1 text-xs font-semibold">
            Lihat Keranjang
          </span>
        </button>
      </div>
      <Dialog open={cartOpen} onClose={() => setCartOpen(false)} title="Keranjang">
        <div className="-mx-4 -my-4">{cartPanel}</div>
      </Dialog>
    </div>
  );
}

function ProductTile({
  product,
  categoryId,
  remainingPcs,
  qtyOf,
  onAdd,
  onSetQty,
}: {
  product: CatalogProduct;
  categoryId: string;
  remainingPcs: number;
  qtyOf: (variantId: string) => number;
  onAdd: (variant: CatalogProduct['variants'][number]) => void;
  onSetQty: (variantId: string, qty: number) => void;
}) {
  const soldOut = !product.isAvailable;
  const variants = product.variants.filter((v) => v.categoryId === categoryId);
  const stockTone =
    soldOut || remainingPcs <= 0
      ? 'text-red-600'
      : remainingPcs < 12
        ? 'text-amber-700'
        : 'text-stone-500';

  return (
    <div
      className={cn(
        'flex h-full gap-3 rounded-2xl bg-white p-3 shadow-sm',
        soldOut && 'opacity-60',
      )}
    >
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-stone-100 text-stone-400">
        {product.imageUrl ? (
          <img
            src={assetUrl(product.imageUrl)}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <UtensilsCrossed className="size-6" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="leading-tight font-semibold">{product.name}</p>
        <p className={cn('text-xs', stockTone)}>
          {soldOut ? 'Habis' : `sisa ${Math.max(0, remainingPcs)} pcs`}
        </p>
        <ul className="mt-2 space-y-1.5">
          {variants.map((v) => {
            const qty = qtyOf(v.id);
            const canAdd = !soldOut && remainingPcs >= v.packSize;
            return (
              <li key={v.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{v.packSize} pcs</span>{' '}
                  <span className="text-stone-600">{formatRupiah(v.price)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    aria-label={`Kurangi ${product.name} ${v.packSize} pcs`}
                    disabled={qty === 0}
                    onClick={() => onSetQty(v.id, qty - 1)}
                    className="flex size-8 items-center justify-center rounded-lg border border-stone-300 disabled:opacity-30"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
                  <button
                    aria-label={`Tambah ${product.name} ${v.packSize} pcs`}
                    disabled={!canAdd}
                    onClick={() => onAdd(v)}
                    className="bg-brand-700 flex size-8 items-center justify-center rounded-lg text-white disabled:bg-stone-300"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
