import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { fmtQty } from '@/features/orders/order-format';

export interface AdjustTarget {
  itemType: 'PRODUCT' | 'INGREDIENT';
  id: string;
  name: string;
  unit: string;
  current: number;
}

const MODES = [
  { key: 'ADD', label: 'Tambah' },
  { key: 'SUBTRACT', label: 'Kurangi' },
  { key: 'SET', label: 'Set jadi' },
] as const;

export function AdjustStockDialog({
  target,
  onClose,
}: {
  target: AdjustTarget | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'ADD' | 'SUBTRACT' | 'SET'>('ADD');
  const [waste, setWaste] = useState(false);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const n = Number(qty.replace(',', '.'));
  const after =
    !target || qty === ''
      ? null
      : mode === 'ADD'
        ? target.current + n
        : mode === 'SUBTRACT'
          ? target.current - n
          : n;

  const save = useMutation({
    mutationFn: () =>
      api.post('/stock/adjust', {
        itemType: target!.itemType,
        itemId: target!.id,
        mode: waste ? 'SUBTRACT' : mode,
        qty: n,
        reason: waste ? 'WASTE' : 'MANUAL_ADJUST',
        note: note.trim(),
      }),
    onSuccess: () => {
      toast.success('Stok diperbarui');
      void queryClient.invalidateQueries({ queryKey: ['stock'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
      close();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function close() {
    setMode('ADD');
    setWaste(false);
    setQty('');
    setNote('');
    onClose();
  }

  return (
    <Dialog
      open={!!target}
      onClose={close}
      title={`Atur stok ${target?.name ?? ''}`}
      description={target ? `Stok sekarang ${fmtQty(target.current)} ${target.unit}` : undefined}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Batal
          </Button>
          <Button
            disabled={qty === '' || Number.isNaN(n) || n < 0 || note.trim().length < 3}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              disabled={waste && m.key !== 'SUBTRACT'}
              onClick={() => setMode(m.key)}
              className={cn(
                'flex-1 rounded-lg py-1.5 text-sm font-medium disabled:opacity-40',
                (waste ? m.key === 'SUBTRACT' : mode === m.key)
                  ? 'bg-white shadow-sm'
                  : 'text-stone-500',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={waste}
            onChange={(e) => setWaste(e.target.checked)}
            className="size-4"
          />
          Barang rusak / basi (dicatat sebagai kerugian)
        </label>
        <Field
          label={`Jumlah (${target?.unit ?? ''})`}
          hint={after !== null ? `Stok setelah: ${fmtQty(after)} ${target?.unit}` : undefined}
        >
          <Input
            inputMode="decimal"
            autoFocus
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^0-9.,]/g, ''))}
          />
        </Field>
        <Field label="Alasan" hint="Wajib — tercatat di riwayat mutasi">
          <Input
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Stok awal, koreksi hitung, jatuh, …"
          />
        </Field>
      </div>
    </Dialog>
  );
}
