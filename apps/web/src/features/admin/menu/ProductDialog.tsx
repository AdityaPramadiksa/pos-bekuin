import { formatRupiah, type ProductView, type VariantView } from '@bekuin/shared';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { ImageUpload } from '@/components/ImageUpload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/input';
import { Switch, SwitchRow } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { useCategories } from '@/lib/queries';
import { useProductCache } from './useProductCache';

export function ProductDialog({
  product,
  onClose,
  onCreated,
}: {
  product: ProductView | 'new' | null;
  onClose: () => void;
  onCreated: (product: ProductView) => void;
}) {
  const isNew = product === 'new';
  const current = product && product !== 'new' ? product : null;
  const saveToCache = useProductCache();
  const [form, setForm] = useState({
    name: current?.name ?? '',
    description: current?.description ?? '',
    imageUrl: current?.imageUrl ?? null,
    minStockPcs: current?.minStockPcs ?? 30,
    sortOrder: current?.sortOrder ?? 0,
    isActive: current?.isActive ?? true,
  });

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...form, description: form.description || null };
      if (isNew) {
        const { isActive: _ignored, ...createBody } = body;
        return (await api.post<ProductView>('/products', createBody)).data;
      }
      return (await api.patch<ProductView>(`/products/${current!.id}`, body)).data;
    },
    onSuccess: (saved) => {
      saveToCache(saved);
      if (isNew) {
        toast.success('Produk dibuat. Sekarang tambahkan varian dan harganya.');
        onCreated(saved);
      } else {
        toast.success('Produk disimpan');
        onClose();
      }
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.name.trim().length < 2) return toast.error('Nama produk minimal 2 karakter');
    save.mutate();
  }

  return (
    <Dialog
      open={product !== null}
      onClose={onClose}
      size="lg"
      title={isNew ? 'Tambah Produk' : `Edit ${current?.name ?? ''}`}
      description={isNew ? 'Simpan dulu, lalu atur varian (kategori, isi pack, harga).' : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {isNew ? 'Batal' : 'Tutup'}
          </Button>
          <Button type="submit" form="product-form" loading={save.isPending}>
            {isNew ? 'Simpan & lanjut' : 'Simpan produk'}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Foto" hint="Otomatis dikecilkan ke WebP ≤ 200 KB">
          <ImageUpload
            purpose="menu"
            value={form.imageUrl}
            onChange={(imageUrl) => setForm({ ...form, imageUrl })}
          />
        </Field>
        <Field label="Nama produk">
          <Input
            value={form.name}
            maxLength={60}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="Deskripsi (tampil di menu pelanggan)">
          <Textarea
            value={form.description}
            maxLength={300}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stok minimum (pcs)" hint="Batas peringatan menipis">
            <Input
              type="number"
              min={0}
              value={form.minStockPcs}
              onChange={(e) => setForm({ ...form, minStockPcs: Number(e.target.value) || 0 })}
            />
          </Field>
          <Field label="Urutan tampil" hint="Kecil = di atas">
            <Input
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) || 0 })}
            />
          </Field>
        </div>
        {!isNew && (
          <SwitchRow
            title="Produk aktif"
            description="Nonaktif = disembunyikan dari POS & menu pelanggan (riwayat order tetap ada)"
            checked={form.isActive}
            onChange={(isActive) => setForm({ ...form, isActive })}
          />
        )}
      </form>

      {current && <VariantsEditor product={current} />}
    </Dialog>
  );
}

function VariantsEditor({ product }: { product: ProductView }) {
  const [adding, setAdding] = useState(product.variants.length === 0);
  return (
    <section className="mt-6 border-t border-stone-100 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Varian & Harga</h3>
          <p className="text-xs text-stone-500">Kategori × isi pack × harga per pack</p>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Varian
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {product.variants.map((v) => (
          <VariantRow
            key={`${v.id}-${v.price}-${v.isActive}-${v.packSize}-${v.categoryId}`}
            productId={product.id}
            variant={v}
          />
        ))}
        {adding && <VariantRow productId={product.id} onDone={() => setAdding(false)} />}
        {product.variants.length === 0 && !adding && (
          <p className="text-sm text-stone-500">Belum ada varian.</p>
        )}
      </div>
    </section>
  );
}

function VariantRow({
  productId,
  variant,
  onDone,
}: {
  productId: string;
  variant?: VariantView;
  onDone?: () => void;
}) {
  const categories = useCategories();
  const saveToCache = useProductCache();
  const activeCategories = (categories.data ?? []).filter(
    (c) => c.isActive || c.id === variant?.categoryId,
  );
  const [draft, setDraft] = useState({
    categoryId: variant?.categoryId ?? '',
    packSize: variant?.packSize ?? 6,
    price: (variant?.price ?? '') as number | '',
    isActive: variant?.isActive ?? true,
  });
  const categoryId = draft.categoryId || activeCategories[0]?.id || '';
  const dirty =
    !variant ||
    variant.categoryId !== categoryId ||
    variant.packSize !== draft.packSize ||
    variant.price !== draft.price ||
    variant.isActive !== draft.isActive;
  const locked = !!variant?.usedInOrders; // kategori & pack tidak bisa diubah

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        categoryId,
        packSize: draft.packSize,
        price: draft.price,
        isActive: draft.isActive,
      };
      if (!variant) {
        const { isActive: _ignored, ...createBody } = body;
        return (await api.post<ProductView>(`/products/${productId}/variants`, createBody)).data;
      }
      return (await api.patch<ProductView>(`/products/${productId}/variants/${variant.id}`, body))
        .data;
    },
    onSuccess: (product) => {
      saveToCache(product);
      toast.success(variant ? 'Varian disimpan' : 'Varian ditambahkan');
      onDone?.();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: async () =>
      (await api.delete<ProductView>(`/products/${productId}/variants/${variant!.id}`)).data,
    onSuccess: (product) => {
      saveToCache(product);
      toast.success(
        variant?.usedInOrders ? 'Varian dinonaktifkan (sudah pernah dipesan)' : 'Varian dihapus',
      );
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="rounded-xl border border-stone-200 p-3">
      <div className="grid grid-cols-[1fr_5rem] gap-2 sm:grid-cols-[1fr_5rem_9rem]">
        <Select
          aria-label="Kategori"
          value={categoryId}
          disabled={locked}
          onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
        >
          {activeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="relative">
          <Input
            aria-label="Isi pack"
            type="number"
            min={1}
            max={100}
            disabled={locked}
            className="pr-9"
            value={draft.packSize}
            onChange={(e) => setDraft({ ...draft, packSize: Number(e.target.value) || 1 })}
          />
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-stone-500">
            pcs
          </span>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <MoneyInput
            aria-label="Harga"
            value={draft.price}
            onChange={(price) => setDraft({ ...draft, price })}
            placeholder="Harga"
          />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {variant ? (
          <label className="flex items-center gap-2 text-xs text-stone-600">
            <Switch
              checked={draft.isActive}
              onChange={(isActive) => setDraft({ ...draft, isActive })}
              label="Aktif"
            />
            {draft.isActive ? 'Aktif' : 'Nonaktif'}
          </label>
        ) : (
          <span className="text-xs text-stone-500">Varian baru</span>
        )}
        {locked && <Badge tone="blue">Pernah dipesan</Badge>}
        {variant && !dirty && (
          <span className="text-xs text-stone-400">{formatRupiah(variant.price)}/pack</span>
        )}
        <div className="ml-auto flex gap-2">
          {variant ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600"
              loading={remove.isPending}
              onClick={() => {
                const msg = variant.usedInOrders
                  ? 'Varian ini sudah pernah dipesan, jadi akan dinonaktifkan (bukan dihapus). Lanjut?'
                  : 'Hapus varian ini?';
                if (window.confirm(msg)) remove.mutate();
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onDone}>
              Batal
            </Button>
          )}
          <Button
            size="sm"
            disabled={!dirty || !categoryId || draft.price === '' || draft.price <= 0}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Simpan
          </Button>
        </div>
      </div>
    </div>
  );
}
