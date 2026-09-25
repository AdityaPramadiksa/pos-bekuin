import { type BaseUnit, INGREDIENT_TYPE_LABEL, type IngredientView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { SwitchRow } from '@/components/ui/switch';
import { fmtQty } from '@/features/orders/order-format';
import { api, errorMessage } from '@/lib/api';
import { useIngredients } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { costPerUnitLabel, rp, unitLabel } from './format';

export function IngredientsTab() {
  const ingredients = useIngredients();
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<IngredientView | 'new' | null>(null);
  const list = (ingredients.data ?? []).filter(
    (i) =>
      (!type || i.type === type) &&
      (!q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase())),
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
          <Input
            className="pl-9"
            placeholder="Cari bahan…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Bahan
        </Button>
      </div>
      <Chips
        value={type}
        onChange={setType}
        options={[
          { key: '', label: 'Semua' },
          ...Object.entries(INGREDIENT_TYPE_LABEL).map(([key, label]) => ({ key, label })),
        ]}
      />
      {ingredients.isPending ? (
        <LoadingState />
      ) : ingredients.isError ? (
        <ErrorState error={ingredients.error} onRetry={() => ingredients.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState title="Tidak ada bahan" />
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {list.map((i) => (
            <li key={i.id}>
              <button
                onClick={() => setEditing(i)}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50',
                  !i.isActive && 'opacity-50',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {i.name} {!i.isActive && <Badge>Nonaktif</Badge>}
                  </p>
                  <p className="text-xs text-stone-500">
                    {INGREDIENT_TYPE_LABEL[i.type]}
                    {i.type !== 'SEMI_FINISHED' && i.purchaseUnit
                      ? ` · ${rp(i.lastPrice)} / ${i.purchaseUnit}`
                      : ''}
                    {i.type === 'SEMI_FINISHED' ? ' · biaya dari resep' : ''}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{costPerUnitLabel(i.unitCost, i.baseUnit)}</p>
                  <p className="text-xs text-stone-500">
                    stok {fmtQty(i.stockQty)} {unitLabel(i.baseUnit)}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <IngredientDialog
        key={editing === 'new' ? 'new' : editing?.id}
        ingredient={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function IngredientDialog({
  ingredient,
  onClose,
}: {
  ingredient: IngredientView | 'new' | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isNew = ingredient === 'new';
  const current = ingredient && ingredient !== 'new' ? ingredient : null;
  const semi = current?.type === 'SEMI_FINISHED';
  const [form, setForm] = useState({
    name: current?.name ?? '',
    type: (current?.type ?? 'RAW') as 'RAW' | 'PACKAGING' | 'SEMI_FINISHED',
    baseUnit: (current?.baseUnit ?? 'GRAM') as BaseUnit,
    purchaseUnit: current?.purchaseUnit ?? '',
    purchaseQty: current?.purchaseQty ?? 1000,
    lastPrice: (current?.lastPrice ?? '') as number | '',
    minStock: current?.minStock ?? 0,
    isActive: current?.isActive ?? true,
  });
  const unitCost =
    form.lastPrice === '' || !form.purchaseQty ? 0 : form.lastPrice / form.purchaseQty;

  const save = useMutation({
    mutationFn: async (): Promise<void> => {
      const common = { name: form.name, minStock: form.minStock };
      if (isNew) {
        await api.post('/ingredients', {
          ...common,
          type: form.type,
          baseUnit: form.baseUnit,
          purchaseUnit: form.purchaseUnit || null,
          purchaseQty: form.purchaseQty,
          lastPrice: form.lastPrice || 0,
        });
      } else if (semi) {
        await api.patch(`/ingredients/${current!.id}`, { ...common, isActive: form.isActive });
      } else {
        await api.patch(`/ingredients/${current!.id}`, {
          ...common,
          purchaseUnit: form.purchaseUnit || null,
          purchaseQty: form.purchaseQty,
          lastPrice: form.lastPrice || 0,
          isActive: form.isActive,
        });
      }
    },
    onSuccess: () => {
      toast.success('Bahan disimpan. HPP menu ikut diperbarui.');
      for (const key of ['ingredients', 'recipes', 'products', 'stock'])
        void queryClient.invalidateQueries({ queryKey: [key] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const unit = unitLabel(form.baseUnit);
  return (
    <Dialog
      open={ingredient !== null}
      onClose={onClose}
      title={isNew ? 'Tambah Bahan' : `Edit ${current?.name ?? ''}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            disabled={form.name.trim().length < 2 || form.purchaseQty <= 0}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nama bahan">
          <Input
            value={form.name}
            maxLength={60}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jenis">
            <Select
              value={form.type}
              disabled={!isNew}
              onChange={(e) => setForm({ ...form, type: e.target.value as 'RAW' | 'PACKAGING' })}
            >
              <option value="RAW">Bahan mentah</option>
              <option value="PACKAGING">Kemasan</option>
              {semi && <option value="SEMI_FINISHED">Setengah jadi</option>}
            </Select>
          </Field>
          <Field label="Satuan dasar" hint={isNew ? undefined : 'Tidak bisa diubah'}>
            <Select
              value={form.baseUnit}
              disabled={!isNew}
              onChange={(e) => setForm({ ...form, baseUnit: e.target.value as BaseUnit })}
            >
              <option value="GRAM">gram (g)</option>
              <option value="ML">mililiter (ml)</option>
              <option value="PCS">pcs / lembar / butir</option>
            </Select>
          </Field>
        </div>
        {semi ? (
          <p className="rounded-xl bg-stone-100 p-3 text-sm">
            Biaya bahan setengah jadi dihitung otomatis dari resepnya:{' '}
            <b>{costPerUnitLabel(current!.unitCost, current!.baseUnit)}</b>
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kemasan beli" hint="Misal: pack 2 kg">
                <Input
                  value={form.purchaseUnit}
                  maxLength={40}
                  onChange={(e) => setForm({ ...form, purchaseUnit: e.target.value })}
                />
              </Field>
              <Field label={`Isi per kemasan (${unit})`}>
                <Input
                  type="number"
                  min={0}
                  value={form.purchaseQty}
                  onChange={(e) => setForm({ ...form, purchaseQty: Number(e.target.value) })}
                />
              </Field>
            </div>
            <Field
              label="Harga beli per kemasan"
              hint={
                unitCost
                  ? `Biaya per unit: ${costPerUnitLabel(unitCost, form.baseUnit)}`
                  : undefined
              }
            >
              <MoneyInput
                value={form.lastPrice}
                onChange={(lastPrice) => setForm({ ...form, lastPrice })}
              />
            </Field>
          </>
        )}
        <Field label={`Stok minimum (${unit})`} hint="Di bawah angka ini muncul peringatan menipis">
          <Input
            type="number"
            min={0}
            value={form.minStock}
            onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })}
          />
        </Field>
        {!isNew && (
          <SwitchRow
            title="Aktif"
            checked={form.isActive}
            onChange={(isActive) => setForm({ ...form, isActive })}
          />
        )}
      </div>
    </Dialog>
  );
}
