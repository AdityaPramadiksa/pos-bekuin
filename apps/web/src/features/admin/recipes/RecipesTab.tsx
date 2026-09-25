import type { BaseUnit, RecipeView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { api, errorMessage } from '@/lib/api';
import { useIngredients, useProducts, useRecipes } from '@/lib/queries';
import { costPerUnitLabel, rp, unitLabel } from './format';

export function RecipesTab() {
  const recipes = useRecipes();
  const [editing, setEditing] = useState<RecipeView | 'new-semi' | 'new-product' | null>(null);
  const groups = [
    { title: 'Setengah jadi (adonan, kulit)', type: 'SEMI_FINISHED' as const },
    { title: 'Produk (komposisi per 1 pcs)', type: 'PRODUCT' as const },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setEditing('new-semi')}>
          <Plus className="size-4" /> Resep setengah jadi
        </Button>
        <Button variant="outline" onClick={() => setEditing('new-product')}>
          <Plus className="size-4" /> Resep produk
        </Button>
      </div>
      {recipes.isPending ? (
        <LoadingState />
      ) : recipes.isError ? (
        <ErrorState error={recipes.error} onRetry={() => recipes.refetch()} />
      ) : recipes.data.length === 0 ? (
        <EmptyState title="Belum ada resep" />
      ) : (
        groups.map((g) => (
          <section key={g.type}>
            <h3 className="mb-2 px-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
              {g.title}
            </h3>
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
              {recipes.data
                .filter((r) => r.type === g.type)
                .map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => setEditing(r)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {r.productName ?? r.name} {!r.isActive && <Badge>Nonaktif</Badge>}
                        </p>
                        <p className="truncate text-xs text-stone-500">
                          {r.lines
                            .map(
                              (l) =>
                                `${l.name} ${l.qty.toLocaleString('id-ID')} ${unitLabel(l.baseUnit)}`,
                            )
                            .join(', ')}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-semibold">
                          {r.type === 'PRODUCT'
                            ? `${rp(r.costPerUnit)}/pcs`
                            : costPerUnitLabel(r.costPerUnit, r.yieldUnit)}
                        </p>
                        {r.type === 'SEMI_FINISHED' && (
                          <p className="text-xs text-stone-500">
                            {rp(r.totalCost)} / {r.yieldQty.toLocaleString('id-ID')}{' '}
                            {unitLabel(r.yieldUnit)}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
      {editing && (
        <RecipeDialog
          key={typeof editing === 'string' ? editing : editing.id}
          recipe={typeof editing === 'string' ? null : editing}
          newType={editing === 'new-semi' ? 'SEMI_FINISHED' : 'PRODUCT'}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RecipeDialog({
  recipe,
  newType,
  onClose,
}: {
  recipe: RecipeView | null;
  newType: 'SEMI_FINISHED' | 'PRODUCT';
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const ingredients = useIngredients();
  const products = useProducts();
  const type = recipe?.type ?? newType;
  const [form, setForm] = useState({
    name: recipe?.name ?? '',
    yieldQty: recipe?.yieldQty ?? 1000,
    yieldUnit: (recipe?.yieldUnit ?? 'GRAM') as BaseUnit,
    productId: recipe?.productId ?? '',
    note: recipe?.note ?? '',
    lines: recipe?.lines.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty })) ?? [
      { ingredientId: '', qty: 0 },
    ],
  });

  const byId = new Map((ingredients.data ?? []).map((i) => [i.id, i]));
  const options = (ingredients.data ?? []).filter(
    (i) =>
      i.isActive &&
      i.id !== recipe?.outputIngredientId &&
      (type === 'SEMI_FINISHED' || i.type !== 'PACKAGING'),
  );
  // Biaya dihitung langsung di layar dari biaya per unit bahan terbaru.
  const total = form.lines.reduce(
    (sum, l) => sum + l.qty * (byId.get(l.ingredientId)?.unitCost ?? 0),
    0,
  );
  const perUnit = type === 'PRODUCT' ? total : form.yieldQty > 0 ? total / form.yieldQty : 0;
  const withoutRecipe = (products.data ?? []).filter((p) => p.isActive && !p.recipeId);
  const validLines = form.lines.filter((l) => l.ingredientId && l.qty > 0);

  const save = useMutation({
    mutationFn: async (): Promise<void> => {
      const lines = validLines;
      if (recipe) {
        await api.patch(`/recipes/${recipe.id}`, {
          ...(type === 'SEMI_FINISHED' ? { name: form.name, yieldQty: form.yieldQty } : {}),
          lines,
          note: form.note || null,
        });
      } else if (type === 'SEMI_FINISHED') {
        await api.post('/recipes', {
          type,
          name: form.name,
          yieldQty: form.yieldQty,
          yieldUnit: form.yieldUnit,
          lines,
          note: form.note || null,
        });
      } else {
        await api.post('/recipes', {
          type,
          productId: form.productId,
          lines,
          note: form.note || null,
        });
      }
    },
    onSuccess: () => {
      toast.success('Resep disimpan. HPP diperbarui.');
      for (const key of ['recipes', 'ingredients', 'products'])
        void queryClient.invalidateQueries({ queryKey: [key] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const setLine = (idx: number, patch: Partial<(typeof form.lines)[number]>) =>
    setForm({ ...form, lines: form.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) });

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={
        recipe
          ? `Resep ${recipe.productName ?? recipe.name}`
          : type === 'PRODUCT'
            ? 'Resep Produk Baru'
            : 'Resep Setengah Jadi Baru'
      }
      description={
        type === 'PRODUCT'
          ? 'Komposisi untuk 1 pcs. Kemasan diatur di varian.'
          : 'Hasilnya menjadi bahan setengah jadi yang bisa dipakai resep lain.'
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            disabled={
              validLines.length === 0 ||
              (type === 'PRODUCT' && !recipe && !form.productId) ||
              (type === 'SEMI_FINISHED' && (form.name.trim().length < 2 || form.yieldQty <= 0))
            }
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Simpan resep
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {type === 'SEMI_FINISHED' ? (
          <div className="grid grid-cols-[1fr_7rem_6rem] gap-2">
            <Field label="Nama hasil">
              <Input
                value={form.name}
                placeholder="Adonan Dasar"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Hasil per batch">
              <Input
                type="number"
                min={0}
                value={form.yieldQty}
                onChange={(e) => setForm({ ...form, yieldQty: Number(e.target.value) })}
              />
            </Field>
            <Field label="Satuan">
              <Select
                value={form.yieldUnit}
                disabled={!!recipe}
                onChange={(e) => setForm({ ...form, yieldUnit: e.target.value as BaseUnit })}
              >
                <option value="GRAM">g</option>
                <option value="ML">ml</option>
                <option value="PCS">pcs</option>
              </Select>
            </Field>
          </div>
        ) : (
          !recipe && (
            <Field
              label="Produk"
              hint={withoutRecipe.length === 0 ? 'Semua produk sudah punya resep' : undefined}
            >
              <Select
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
              >
                <option value="">— Pilih produk —</option>
                {withoutRecipe.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )
        )}

        <div>
          <p className="mb-2 text-sm font-medium">Bahan</p>
          <ul className="space-y-2">
            {form.lines.map((l, idx) => {
              const ing = byId.get(l.ingredientId);
              return (
                <li
                  key={idx}
                  className="grid grid-cols-[1fr_6.5rem_5.5rem_2rem] items-center gap-2"
                >
                  <Select
                    aria-label="Bahan"
                    value={l.ingredientId}
                    onChange={(e) => setLine(idx, { ingredientId: e.target.value })}
                  >
                    <option value="">— Pilih bahan —</option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({costPerUnitLabel(o.unitCost, o.baseUnit)})
                      </option>
                    ))}
                  </Select>
                  <div className="relative">
                    <Input
                      aria-label="Jumlah"
                      type="number"
                      min={0}
                      step="any"
                      className="pr-8"
                      value={l.qty || ''}
                      onChange={(e) => setLine(idx, { qty: Number(e.target.value) })}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-stone-500">
                      {ing ? unitLabel(ing.baseUnit) : ''}
                    </span>
                  </div>
                  <span className="text-right text-sm tabular-nums">
                    {rp(l.qty * (ing?.unitCost ?? 0))}
                  </span>
                  <button
                    aria-label="Hapus bahan"
                    onClick={() =>
                      setForm({ ...form, lines: form.lines.filter((_, i) => i !== idx) })
                    }
                    className="text-stone-400 hover:text-red-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() =>
              setForm({ ...form, lines: [...form.lines, { ingredientId: '', qty: 0 }] })
            }
          >
            <Plus className="size-4" /> Tambah bahan
          </Button>
        </div>

        <div className="rounded-xl bg-stone-50 p-3 text-sm">
          <div className="flex justify-between">
            <span>Total biaya {type === 'SEMI_FINISHED' ? 'per batch' : 'per pcs'}</span>
            <b>{rp(total)}</b>
          </div>
          {type === 'SEMI_FINISHED' && (
            <div className="flex justify-between text-stone-600">
              <span>Biaya per {unitLabel(form.yieldUnit)}</span>
              <span>{costPerUnitLabel(perUnit, form.yieldUnit)}</span>
            </div>
          )}
          {type === 'PRODUCT' && (
            <p className="mt-1 text-xs text-stone-500">
              HPP per pcs di menu dibulatkan ke Rp10 terdekat ({rp(Math.round(total / 10) * 10)}).
            </p>
          )}
        </div>
        <Field label="Catatan (opsional)">
          <Textarea
            className="min-h-14"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>
      </div>
    </Dialog>
  );
}
