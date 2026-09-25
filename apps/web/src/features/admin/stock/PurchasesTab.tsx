import { formatRupiah, STOCK_UNIT_LABEL } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ImageUpload } from '@/components/ImageUpload';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { dateKeyWita, fmtQty, formatDateKey } from '@/features/orders/order-format';
import { api, assetUrl, errorMessage } from '@/lib/api';
import { useIngredients, usePurchases } from '@/lib/queries';

export function PurchasesTab() {
  const purchases = usePurchases();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Catat belanja
      </Button>
      {purchases.isPending ? (
        <LoadingState />
      ) : purchases.isError ? (
        <ErrorState error={purchases.error} onRetry={() => purchases.refetch()} />
      ) : purchases.data.length === 0 ? (
        <EmptyState
          title="Belum ada stok masuk"
          description="Catat belanja bahan agar stok & harga rata-rata ter-update."
        />
      ) : (
        <ul className="space-y-2">
          {purchases.data.map((p) => (
            <li key={p.id} className="rounded-2xl bg-white p-3 shadow-sm">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatDateKey(p.date)}
                    {p.supplier ? ` · ${p.supplier}` : ''}
                  </p>
                  <p className="text-xs text-stone-500">oleh {p.createdBy}</p>
                </div>
                <p className="font-bold">{formatRupiah(p.total)}</p>
              </div>
              <ul className="mt-2 space-y-0.5 text-sm text-stone-700">
                {p.items.map((i) => (
                  <li key={i.ingredientId} className="flex justify-between gap-2">
                    <span>
                      {i.name} +{fmtQty(i.qtyBase)} {STOCK_UNIT_LABEL[i.baseUnit]}
                    </span>
                    <span className="text-stone-500">{formatRupiah(i.totalPrice)}</span>
                  </li>
                ))}
              </ul>
              {p.photoUrl && (
                <a
                  href={assetUrl(p.photoUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-700 mt-1 inline-block text-xs"
                >
                  Lihat foto nota
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && <PurchaseDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

function PurchaseDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const ingredients = useIngredients();
  const options = (ingredients.data ?? []).filter((i) => i.isActive && i.type !== 'SEMI_FINISHED');
  const byId = new Map(options.map((i) => [i.id, i]));
  const [form, setForm] = useState({
    date: dateKeyWita(0),
    supplier: '',
    photoUrl: null as string | null,
    items: [{ ingredientId: '', packQty: 1, totalPrice: '' as number | '' }],
  });
  const valid = form.items.filter((i) => i.ingredientId && i.packQty > 0 && i.totalPrice !== '');
  const total = valid.reduce((sum, i) => sum + Number(i.totalPrice), 0);

  const save = useMutation({
    mutationFn: () =>
      api.post('/purchases', {
        date: form.date,
        supplier: form.supplier || null,
        photoUrl: form.photoUrl,
        items: valid.map((i) => ({
          ingredientId: i.ingredientId,
          packQty: i.packQty,
          totalPrice: i.totalPrice,
        })),
      }),
    onSuccess: () => {
      toast.success('Stok masuk dicatat');
      for (const key of ['stock', 'ingredients', 'recipes', 'products'])
        void queryClient.invalidateQueries({ queryKey: [key] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const setItem = (idx: number, patch: Partial<(typeof form.items)[number]>) =>
    setForm({ ...form, items: form.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Catat Belanja (Stok Masuk)"
      description="Stok bertambah dan harga rata-rata diperbarui otomatis"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            disabled={valid.length === 0}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Simpan {total ? formatRupiah(total) : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal">
            <Input
              type="date"
              max={dateKeyWita(0)}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Field label="Supplier (opsional)">
            <Input
              value={form.supplier}
              maxLength={60}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
            />
          </Field>
        </div>
        <ul className="space-y-3">
          {form.items.map((it, idx) => {
            const ing = byId.get(it.ingredientId);
            const qtyBase = ing ? it.packQty * ing.purchaseQty : 0;
            return (
              <li key={idx} className="rounded-xl border border-stone-200 p-3">
                <div className="flex gap-2">
                  <Select
                    aria-label="Bahan"
                    value={it.ingredientId}
                    onChange={(e) => setItem(idx, { ingredientId: e.target.value })}
                  >
                    <option value="">— Pilih bahan —</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                        {o.purchaseUnit ? ` (${o.purchaseUnit})` : ''}
                      </option>
                    ))}
                  </Select>
                  <button
                    aria-label="Hapus baris"
                    onClick={() =>
                      setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })
                    }
                    className="text-stone-400 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field label={`Jumlah ${ing?.purchaseUnit ?? 'kemasan'}`}>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={it.packQty || ''}
                      onChange={(e) => setItem(idx, { packQty: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Total harga">
                    <MoneyInput
                      value={it.totalPrice}
                      onChange={(totalPrice) => setItem(idx, { totalPrice })}
                    />
                  </Field>
                </div>
                {ing && qtyBase > 0 && (
                  <p className="mt-1 text-xs text-stone-500">
                    = {fmtQty(qtyBase)} {STOCK_UNIT_LABEL[ing.baseUnit]}
                    {it.totalPrice !== '' &&
                      ` · Rp${(Number(it.totalPrice) / qtyBase).toLocaleString('id-ID', { maximumFractionDigits: 2 })}/${STOCK_UNIT_LABEL[ing.baseUnit]}`}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setForm({
              ...form,
              items: [...form.items, { ingredientId: '', packQty: 1, totalPrice: '' }],
            })
          }
        >
          <Plus className="size-4" /> Tambah bahan
        </Button>
        <Field label="Foto nota (opsional)">
          <ImageUpload
            purpose="receipt"
            aspect="portrait"
            value={form.photoUrl}
            onChange={(photoUrl) => setForm({ ...form, photoUrl })}
          />
        </Field>
      </div>
    </Dialog>
  );
}
