import type { SalesCategoryView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { queryKeys, useCategories } from '@/lib/queries';

function useCategoryMutation<T>(fn: (vars: T) => Promise<unknown>, success: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(success);
      void queryClient.invalidateQueries({ queryKey: queryKeys.categories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.products });
      void queryClient.invalidateQueries({ queryKey: queryKeys.catalog });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function CategoriesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useCategories();
  const [draft, setDraft] = useState({ code: '', name: '' });
  const create = useCategoryMutation(
    () => api.post('/sales-categories', { ...draft, sortOrder: categories.data?.length ?? 0 }),
    'Kategori ditambahkan',
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Kategori Penjualan"
      description="Misal Frozen, Siap Makan, Minuman"
    >
      {categories.isPending ? (
        <LoadingState rows={2} />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
      ) : (
        <ul className="space-y-2">
          {categories.data.map((c) => (
            <CategoryRow
              key={`${c.id}-${c.name}-${c.isActive}-${c.isCustomerVisible}`}
              category={c}
            />
          ))}
        </ul>
      )}

      <form
        className="mt-5 space-y-3 border-t border-stone-100 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(undefined, { onSuccess: () => setDraft({ code: '', name: '' }) });
        }}
      >
        <p className="text-sm font-semibold">Tambah kategori</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Kode" hint="Tidak bisa diubah">
            <Input
              placeholder="MINUMAN"
              value={draft.code}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''),
                })
              }
            />
          </Field>
          <Field label="Nama">
            <Input
              placeholder="Minuman"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={draft.code.length < 2 || draft.name.trim().length < 2}
          loading={create.isPending}
        >
          Tambah
        </Button>
      </form>
    </Dialog>
  );
}

function CategoryRow({ category }: { category: SalesCategoryView }) {
  const [name, setName] = useState(category.name);
  const update = useCategoryMutation(
    (body: Partial<SalesCategoryView>) => api.patch(`/sales-categories/${category.id}`, body),
    'Kategori disimpan',
  );

  return (
    <li className="rounded-xl border border-stone-200 p-3">
      <div className="flex items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nama kategori" />
        <Button
          size="sm"
          variant="outline"
          disabled={name.trim() === category.name || name.trim().length < 2}
          loading={update.isPending}
          onClick={() => update.mutate({ name: name.trim() })}
        >
          Simpan
        </Button>
      </div>
      <p className="mt-1 font-mono text-[11px] text-stone-400">{category.code}</p>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-stone-600">
        <label className="flex items-center gap-2">
          <Switch
            checked={category.isCustomerVisible}
            onChange={(isCustomerVisible) => update.mutate({ isCustomerVisible })}
            label="Tampil ke pelanggan"
          />
          Tampil di menu QR pelanggan
        </label>
        <label className="flex items-center gap-2">
          <Switch
            checked={category.isActive}
            onChange={(isActive) => update.mutate({ isActive })}
            label="Aktif"
          />
          Aktif
        </label>
      </div>
    </li>
  );
}
