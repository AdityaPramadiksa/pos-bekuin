import { formatRupiah, type ProductionPreview, STOCK_UNIT_LABEL } from '@bekuin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Factory } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { fmtQty, formatDateTime } from '@/features/orders/order-format';
import { api, errorMessage } from '@/lib/api';
import { useProductions, useRecipes } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function ProductionTab({ prefill }: { prefill?: { recipeId: string; batchQty: number }[] }) {
  const productions = useProductions();
  const [open, setOpen] = useState<{ recipeId: string; batchQty: number } | null | 'new'>(
    prefill?.[0] ?? null,
  );
  return (
    <div className="space-y-3">
      <Button onClick={() => setOpen('new')}>
        <Factory className="size-4" /> Produksi
      </Button>
      {productions.isPending ? (
        <LoadingState />
      ) : productions.isError ? (
        <ErrorState error={productions.error} onRetry={() => productions.refetch()} />
      ) : productions.data.length === 0 ? (
        <EmptyState
          title="Belum ada produksi"
          description="Produksi adonan & produk menambah stok dan menghitung biaya aktual."
        />
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {productions.data.map((p) => {
            const unit = STOCK_UNIT_LABEL[p.outputUnit];
            return (
              <li key={p.id} className="px-4 py-3 text-sm">
                <div className="flex justify-between gap-2">
                  <p className="font-medium">
                    {p.outputName} +{fmtQty(p.actualOutput)} {unit}
                  </p>
                  <p className="font-semibold">{formatRupiah(p.totalCost)}</p>
                </div>
                <p className="text-xs text-stone-500">
                  {formatDateTime(p.createdAt)} · {p.createdBy} · Rp
                  {p.costPerUnit.toLocaleString('id-ID', { maximumFractionDigits: 2 })}/{unit}
                  {p.yieldVariance !== 0 && (
                    <span className={p.yieldVariance < 0 ? 'text-red-600' : 'text-green-700'}>
                      {' '}
                      · selisih {p.yieldVariance > 0 ? '+' : ''}
                      {fmtQty(p.yieldVariance)} {unit}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {open && (
        <ProductionDialog
          initial={open === 'new' ? undefined : open}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

export function ProductionDialog({
  initial,
  onClose,
}: {
  initial?: { recipeId: string; batchQty: number };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const recipes = useRecipes();
  const [recipeId, setRecipeId] = useState(initial?.recipeId ?? '');
  const [batchQty, setBatchQty] = useState(initial?.batchQty ?? 1);
  const [actual, setActual] = useState<string>('');
  const [note, setNote] = useState('');
  const recipe = recipes.data?.find((r) => r.id === recipeId);

  const preview = useQuery({
    queryKey: ['production-preview', recipeId, batchQty],
    queryFn: async () =>
      (await api.post<ProductionPreview>('/productions/preview', { recipeId, batchQty })).data,
    enabled: !!recipeId && batchQty > 0,
  });

  const save = useMutation({
    mutationFn: () =>
      api.post('/productions', {
        recipeId,
        batchQty,
        actualOutput: actual ? Number(actual) : undefined,
        note: note || undefined,
      }),
    onSuccess: () => {
      toast.success('Produksi dicatat, stok diperbarui');
      for (const key of ['stock', 'ingredients', 'recipes', 'products', 'catalog'])
        void queryClient.invalidateQueries({ queryKey: [key] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error), { duration: 8000 }),
  });

  const p = preview.data;
  const unit = p ? STOCK_UNIT_LABEL[p.outputUnit] : '';
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Produksi"
      description="Bahan berkurang, hasil bertambah dengan biaya aktual"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button disabled={!p?.canProduce} loading={save.isPending} onClick={() => save.mutate()}>
            Jalankan produksi
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_8rem] gap-2">
          <Field label="Resep">
            <Select
              value={recipeId}
              onChange={(e) => {
                setRecipeId(e.target.value);
                setActual('');
              }}
            >
              <option value="">— Pilih —</option>
              <optgroup label="Setengah jadi (per batch)">
                {(recipes.data ?? [])
                  .filter((r) => r.type === 'SEMI_FINISHED' && r.isActive)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Produk (per pcs)">
                {(recipes.data ?? [])
                  .filter((r) => r.type === 'PRODUCT' && r.isActive)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.productName}
                    </option>
                  ))}
              </optgroup>
            </Select>
          </Field>
          <Field label={recipe?.type === 'PRODUCT' ? 'Jumlah pcs' : 'Jumlah batch'}>
            <Input
              type="number"
              min={0}
              step={recipe?.type === 'PRODUCT' ? 1 : 'any'}
              value={batchQty || ''}
              onChange={(e) => {
                setBatchQty(Number(e.target.value));
                setActual('');
              }}
            />
          </Field>
        </div>

        {preview.isFetching && !p && <LoadingState rows={2} />}
        {preview.isError && <ErrorState error={preview.error} />}
        {p && (
          <>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="py-1 font-medium">Bahan</th>
                  <th className="py-1 text-right font-medium">Butuh</th>
                  <th className="py-1 text-right font-medium">Stok</th>
                  <th className="py-1 text-right font-medium">Biaya</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {p.needs.map((n) => (
                  <tr key={n.ingredientId} className={cn(n.short && 'text-red-600')}>
                    <td className="py-1.5">{n.name}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {fmtQty(n.need)} {STOCK_UNIT_LABEL[n.baseUnit]}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{fmtQty(n.available)}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatRupiah(n.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!p.canProduce && (
              <p className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="size-4" /> Bahan kurang. Catat belanja atau produksi bahan
                setengah jadi dulu.
              </p>
            )}
            <div className="rounded-xl bg-stone-50 p-3 text-sm">
              <div className="flex justify-between">
                <span>Hasil teori</span>
                <b>
                  {fmtQty(p.expectedOutput)} {unit} {p.outputName}
                </b>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Perkiraan biaya</span>
                <span>
                  {formatRupiah(p.estimatedCost)} (Rp
                  {p.costPerUnit.toLocaleString('id-ID', { maximumFractionDigits: 2 })}/{unit})
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label={`Hasil aktual (${unit})`} hint="Kosongkan bila sama dengan teori">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  placeholder={String(p.expectedOutput)}
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                />
              </Field>
              <Field label="Catatan">
                <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
