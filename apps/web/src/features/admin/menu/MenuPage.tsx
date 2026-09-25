import { formatRupiah, type ProductView } from '@bekuin/shared';
import { useMutation } from '@tanstack/react-query';
import { Plus, Search, Tags, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { api, assetUrl, errorMessage } from '@/lib/api';
import { useProducts } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { CategoriesDialog } from './CategoriesDialog';
import { ProductDialog } from './ProductDialog';
import { useProductCache } from './useProductCache';

type Filter = 'all' | 'active' | 'soldout' | 'inactive';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'active', label: 'Aktif' },
  { key: 'soldout', label: 'Habis' },
  { key: 'inactive', label: 'Nonaktif' },
  { key: 'all', label: 'Semua' },
];

export function MenuPage() {
  const products = useProducts();
  const [filter, setFilter] = useState<Filter>('active');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ProductView | 'new' | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const saveToCache = useProductCache();

  const availability = useMutation({
    mutationFn: async (vars: { id: string; isAvailable: boolean }) =>
      (
        await api.patch<ProductView>(`/products/${vars.id}/availability`, {
          isAvailable: vars.isAvailable,
        })
      ).data,
    onSuccess: (product) => {
      saveToCache(product);
      toast.success(
        product.isAvailable ? `${product.name} tersedia lagi` : `${product.name} ditandai habis`,
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (filter === 'active') return p.isActive;
      if (filter === 'soldout') return p.isActive && !p.isAvailable;
      if (filter === 'inactive') return !p.isActive;
      return true;
    });
  }, [products.data, filter, search]);

  return (
    <>
      <PageHeader
        title="Menu & Harga"
        subtitle="Produk, varian, harga, foto, dan ketersediaan"
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCategoriesOpen(true)}>
              <Tags className="size-4" /> Kategori
            </Button>
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="size-4" /> Produk
            </Button>
          </div>
        }
      />

      <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-6">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
          <Input
            placeholder="Cari produk…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm whitespace-nowrap',
                filter === f.key
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-stone-300 bg-white text-stone-600',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {products.isPending ? (
          <LoadingState />
        ) : products.isError ? (
          <ErrorState error={products.error} onRetry={() => products.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState
            title="Belum ada produk"
            description={
              search ? 'Tidak ada produk yang cocok dengan pencarian.' : 'Tambahkan produk pertama.'
            }
            action={!search && <Button onClick={() => setEditing('new')}>Tambah produk</Button>}
          />
        ) : (
          <ul className="space-y-3">
            {visible.map((p) => (
              <li key={p.id}>
                <ProductCard
                  product={p}
                  onOpen={() => setEditing(p)}
                  onToggleAvailable={(isAvailable) =>
                    availability.mutate({ id: p.id, isAvailable })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProductDialog
        key={editing === 'new' ? 'new' : editing?.id}
        product={editing}
        onClose={() => setEditing(null)}
        onCreated={(product) => setEditing(product)}
      />
      <CategoriesDialog open={categoriesOpen} onClose={() => setCategoriesOpen(false)} />
    </>
  );
}

function ProductCard({
  product,
  onOpen,
  onToggleAvailable,
}: {
  product: ProductView;
  onOpen: () => void;
  onToggleAvailable: (isAvailable: boolean) => void;
}) {
  // Kelompokkan varian aktif per kategori: "Frozen: 6 pcs Rp22.000 · 9 pcs Rp33.000"
  const groups = new Map<string, string[]>();
  for (const v of product.variants.filter((v) => v.isActive)) {
    const list = groups.get(v.categoryName) ?? [];
    list.push(`${v.packSize} pcs ${formatRupiah(v.price)}`);
    groups.set(v.categoryName, list);
  }

  return (
    <div
      className={cn(
        'flex gap-3 rounded-2xl bg-white p-3 shadow-sm',
        !product.isActive && 'opacity-60',
      )}
    >
      <button onClick={onOpen} className="flex min-w-0 flex-1 gap-3 text-left">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-stone-100 text-stone-400">
          {product.imageUrl ? (
            <img src={assetUrl(product.imageUrl)} alt="" className="size-full object-cover" />
          ) : (
            <UtensilsCrossed className="size-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-semibold">{product.name}</p>
            {!product.isActive && <Badge>Nonaktif</Badge>}
            {product.isActive && !product.isAvailable && <Badge tone="red">Habis</Badge>}
          </div>
          {groups.size === 0 ? (
            <p className="mt-1 text-xs text-amber-700">
              Belum ada varian aktif — belum tampil di POS
            </p>
          ) : (
            [...groups].map(([category, items]) => (
              <p key={category} className="mt-0.5 text-xs text-stone-600">
                <span className="font-medium text-stone-800">{category}:</span> {items.join(' · ')}
              </p>
            ))
          )}
        </div>
      </button>
      {product.isActive && (
        <div className="flex flex-col items-center gap-1">
          <Switch checked={product.isAvailable} onChange={onToggleAvailable} label="Tersedia" />
          <span className="text-[10px] text-stone-500">
            {product.isAvailable ? 'Tersedia' : 'Habis'}
          </span>
        </div>
      )}
    </div>
  );
}
