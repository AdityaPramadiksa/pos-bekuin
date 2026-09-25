import { formatRupiah, type ExpenseView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image, Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ImageUpload } from '@/components/ImageUpload';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { dateKeyWita, formatDateKey } from '@/features/orders/order-format';
import { api, assetUrl, errorMessage } from '@/lib/api';
import {
  useCurrentShift,
  useExpenseCategories,
  useExpenses,
  usePaymentMethods,
} from '@/lib/queries';
import { PeriodFilter, type Period } from './PeriodFilter';
import { periodRange } from './periods';

export function ExpensesTab() {
  const [period, setPeriod] = useState<Period>({ key: 'today', ...periodRange('today') });
  const [editing, setEditing] = useState<ExpenseView | 'new' | null>(null);
  const expenses = useExpenses(period.from, period.to);
  const total = (expenses.data ?? []).reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-3">
      <PeriodFilter value={period} onChange={setPeriod} />
      <div className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs text-stone-500">Total pengeluaran</p>
          <p className="text-2xl font-bold">{formatRupiah(total)}</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" /> Catat
        </Button>
      </div>
      <p className="text-xs text-stone-500">
        Belanja bahan baku dicatat di Stok → Stok Masuk, bukan di sini, supaya tidak terhitung dua
        kali.
      </p>
      {expenses.isPending ? (
        <LoadingState />
      ) : expenses.isError ? (
        <ErrorState error={expenses.error} onRetry={() => expenses.refetch()} />
      ) : expenses.data.length === 0 ? (
        <EmptyState
          title="Belum ada pengeluaran"
          description="Catat sewa, listrik, gaji, gas, ongkir, dan biaya operasional lain."
        />
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {expenses.data.map((e) => (
            <li key={e.id}>
              <button
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50"
                onClick={() => setEditing(e)}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium">
                    {e.categoryName}
                    {e.fromCashDrawer && <Badge tone="amber">Kas laci</Badge>}
                    {e.locked && <Lock className="size-3.5 text-stone-400" aria-label="Terkunci" />}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {formatDateKey(e.date)} · {e.paymentMethodName ?? '-'}
                    {e.note ? ` · ${e.note}` : ''}
                  </p>
                </div>
                {e.photoUrl && (
                  <Image className="size-4 text-stone-400" aria-label="Ada foto nota" />
                )}
                <span className="font-semibold tabular-nums">{formatRupiah(e.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ExpenseDialog
          key={editing === 'new' ? 'new' : editing.id}
          expense={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ExpenseDialog({ expense, onClose }: { expense: ExpenseView | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const categories = useExpenseCategories();
  const methods = usePaymentMethods();
  const shift = useCurrentShift();
  const cash = methods.data?.find((m) => m.type === 'CASH');
  const [form, setForm] = useState({
    date: expense?.date ?? dateKeyWita(0),
    categoryId: expense?.categoryId ?? '',
    amount: (expense?.amount ?? '') as number | '',
    paymentMethodId: expense?.paymentMethodId ?? '',
    note: expense?.note ?? '',
    photoUrl: expense?.photoUrl ?? null,
  });
  const methodId = form.paymentMethodId || cash?.id || '';
  const isCash = methods.data?.find((m) => m.id === methodId)?.type === 'CASH';
  const locked = !!expense?.locked;

  const done = (message: string) => {
    toast.success(message);
    void queryClient.invalidateQueries({ queryKey: ['finance'] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
    onClose();
  };
  const save = useMutation({
    mutationFn: () => {
      const body = { ...form, paymentMethodId: methodId, note: form.note || null };
      return expense ? api.patch(`/expenses/${expense.id}`, body) : api.post('/expenses', body);
    },
    onSuccess: () => done(expense ? 'Pengeluaran diperbarui' : 'Pengeluaran dicatat'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/expenses/${expense!.id}`),
    onSuccess: () => done('Pengeluaran dihapus'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const invalid = !form.categoryId || !form.amount || !methodId;

  return (
    <Dialog
      open
      onClose={onClose}
      title={expense ? 'Ubah pengeluaran' : 'Catat pengeluaran'}
      footer={
        locked ? (
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        ) : (
          <>
            {expense && (
              <Button
                variant="ghost"
                className="mr-auto text-red-600"
                loading={remove.isPending}
                onClick={() => window.confirm('Hapus pengeluaran ini?') && remove.mutate()}
              >
                Hapus
              </Button>
            )}
            <Button disabled={invalid} loading={save.isPending} onClick={() => save.mutate()}>
              Simpan
            </Button>
          </>
        )
      }
    >
      <fieldset disabled={locked} className="space-y-3">
        {locked && (
          <p className="rounded-lg bg-stone-100 p-2 text-xs text-stone-600">
            Shift kasir untuk pengeluaran ini sudah ditutup, jadi tidak bisa diubah.
          </p>
        )}
        <div>
          <p className="mb-1 text-sm font-medium">Kategori</p>
          {categories.isPending ? (
            <LoadingState rows={1} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Chips
                options={(categories.data ?? []).map((c) => ({ key: c.id, label: c.name }))}
                value={form.categoryId}
                onChange={(categoryId) => setForm({ ...form, categoryId })}
              />
            </div>
          )}
        </div>
        <Field label="Nominal">
          <MoneyInput
            autoFocus={!expense}
            value={form.amount}
            onChange={(amount) => setForm({ ...form, amount })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Dibayar dari">
            <Select
              value={methodId}
              onChange={(e) => setForm({ ...form, paymentMethodId: e.target.value })}
            >
              {(methods.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.type === 'CASH' ? `${m.name} (laci)` : m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tanggal">
            <Input
              type="date"
              value={form.date}
              max={dateKeyWita(0)}
              onChange={(e) => e.target.value && setForm({ ...form, date: e.target.value })}
            />
          </Field>
        </div>
        {isCash && !expense && form.date === dateKeyWita(0) && (
          <p className="text-xs text-amber-700">
            {shift.data
              ? 'Uang diambil dari laci: tercatat di shift yang sedang buka dan mengurangi kas seharusnya.'
              : 'Belum ada shift terbuka, jadi pengeluaran ini tidak mengurangi kas shift.'}
          </p>
        )}
        <Field label="Catatan (opsional)">
          <Input
            value={form.note}
            maxLength={200}
            placeholder="mis. token listrik bulan ini"
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>
        <div>
          <p className="mb-1 text-sm font-medium">Foto nota (opsional)</p>
          {locked ? (
            form.photoUrl ? (
              <a href={assetUrl(form.photoUrl)} target="_blank" rel="noreferrer">
                <img src={assetUrl(form.photoUrl)} alt="Foto nota" className="h-32 rounded-lg" />
              </a>
            ) : (
              <p className="text-sm text-stone-500">Tidak ada</p>
            )
          ) : (
            <ImageUpload
              purpose="receipt"
              aspect="portrait"
              value={form.photoUrl}
              onChange={(photoUrl) => setForm({ ...form, photoUrl })}
            />
          )}
        </div>
      </fieldset>
    </Dialog>
  );
}
