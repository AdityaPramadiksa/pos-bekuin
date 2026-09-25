import { formatRupiah, type OpnameView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { fmtQty, formatDateTime } from '@/features/orders/order-format';
import { api, errorMessage } from '@/lib/api';
import { useOpnames } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function OpnameTab() {
  const opnames = useOpnames();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState('PRODUCT');
  const [editing, setEditing] = useState<OpnameView | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const [s, type] = scope.split(':');
      return (await api.post<OpnameView>('/opnames', { scope: s, ingredientType: type })).data;
    },
    onSuccess: (o) => {
      void queryClient.invalidateQueries({ queryKey: ['stock', 'opnames'] });
      setEditing(o);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          aria-label="Cakupan opname"
        >
          <option value="PRODUCT">Produk (pcs)</option>
          <option value="INGREDIENT:RAW">Bahan mentah</option>
          <option value="INGREDIENT:SEMI_FINISHED">Bahan setengah jadi</option>
          <option value="INGREDIENT:PACKAGING">Kemasan</option>
          <option value="ALL">Semua</option>
        </Select>
        <Button loading={create.isPending} onClick={() => create.mutate()}>
          <ClipboardList className="size-4" /> Opname baru
        </Button>
      </div>
      {opnames.isPending ? (
        <LoadingState />
      ) : opnames.isError ? (
        <ErrorState error={opnames.error} onRetry={() => opnames.refetch()} />
      ) : opnames.data.length === 0 ? (
        <EmptyState
          title="Belum ada stok opname"
          description="Hitung stok fisik berkala agar stok sistem akurat."
        />
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {opnames.data.map((o) => (
            <li key={o.id}>
              <button
                onClick={() => setEditing(o)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-stone-50"
              >
                <div className="flex-1">
                  <p className="font-medium">
                    {formatDateTime(o.createdAt)}{' '}
                    <Badge tone={o.status === 'DRAFT' ? 'amber' : 'green'}>
                      {o.status === 'DRAFT' ? 'Draft' : 'Final'}
                    </Badge>
                  </p>
                  <p className="text-xs text-stone-500">
                    {o.countedItems}/{o.items.length} item dihitung · {o.createdBy}
                  </p>
                </div>
                <span
                  className={cn(
                    'font-semibold',
                    o.totalDiffValue < 0 ? 'text-red-600' : 'text-stone-700',
                  )}
                >
                  {formatRupiah(o.totalDiffValue)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <OpnameDialog key={editing.id} opname={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function OpnameDialog({ opname, onClose }: { opname: OpnameView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const draft = opname.status === 'DRAFT';
  const [counts, setCounts] = useState<Record<string, string>>(
    Object.fromEntries(
      opname.items.map((i) => [i.id, i.physicalQty === null ? '' : String(i.physicalQty)]),
    ),
  );
  const [q, setQ] = useState('');
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['stock'] });
    void queryClient.invalidateQueries({ queryKey: ['catalog'] });
  };
  const body = () => ({
    items: opname.items.map((i) => ({
      id: i.id,
      physicalQty: counts[i.id] === '' ? null : Number(counts[i.id]),
    })),
  });

  const saveDraft = useMutation({
    mutationFn: () => api.patch(`/opnames/${opname.id}`, body()),
    onSuccess: () => {
      toast.success('Draft opname disimpan');
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const finalize = useMutation({
    mutationFn: async () => {
      await api.patch(`/opnames/${opname.id}`, body());
      await api.post(`/opnames/${opname.id}/finalize`);
    },
    onSuccess: () => {
      toast.success('Opname final, stok disesuaikan');
      refresh();
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/opnames/${opname.id}`),
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const rows = opname.items.filter(
    (i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const totalDiff = opname.items.reduce((sum, i) => {
    const c = counts[i.id];
    return c === '' || c === undefined
      ? sum
      : sum + Math.round((Number(c) - i.systemQty) * i.unitCost);
  }, 0);

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`Stok Opname ${draft ? '(draft)' : '(final)'}`}
      description={`${formatDateTime(opname.createdAt)} · selisih nilai ${formatRupiah(draft ? totalDiff : opname.totalDiffValue)}`}
      footer={
        draft ? (
          <>
            <Button
              variant="ghost"
              className="text-red-600"
              loading={remove.isPending}
              onClick={() => window.confirm('Hapus draft opname?') && remove.mutate()}
            >
              Hapus
            </Button>
            <Button
              variant="outline"
              loading={saveDraft.isPending}
              onClick={() => saveDraft.mutate()}
            >
              Simpan draft
            </Button>
            <Button
              loading={finalize.isPending}
              onClick={() =>
                window.confirm('Finalkan? Stok sistem akan disetel sesuai hitungan fisik.') &&
                finalize.mutate()
              }
            >
              Finalkan
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <Field label="Cari item">
          <Input value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-500">
            <tr>
              <th className="py-1 font-medium">Item</th>
              <th className="py-1 text-right font-medium">Sistem</th>
              <th className="w-28 py-1 text-right font-medium">Fisik</th>
              <th className="py-1 text-right font-medium">Selisih</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((i) => {
              const c = counts[i.id];
              const diff = draft
                ? c === ''
                  ? null
                  : Number(c) - i.systemQty
                : i.physicalQty === null
                  ? null
                  : i.diffQty;
              return (
                <tr key={i.id}>
                  <td className="py-1.5">
                    {i.name} <span className="text-xs text-stone-400">{i.unit}</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{fmtQty(i.systemQty)}</td>
                  <td className="py-1.5 text-right">
                    {draft ? (
                      <Input
                        aria-label={`Fisik ${i.name}`}
                        inputMode="decimal"
                        className="h-8 text-right"
                        value={c}
                        onChange={(e) =>
                          setCounts({ ...counts, [i.id]: e.target.value.replace(/[^0-9.]/g, '') })
                        }
                      />
                    ) : (
                      <span className="tabular-nums">
                        {i.physicalQty === null ? '-' : fmtQty(i.physicalQty)}
                      </span>
                    )}
                  </td>
                  <td
                    className={cn(
                      'py-1.5 text-right tabular-nums',
                      diff !== null && diff < 0 && 'text-red-600',
                      diff !== null && diff > 0 && 'text-green-700',
                    )}
                  >
                    {diff === null ? '' : `${diff > 0 ? '+' : ''}${fmtQty(diff)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}
