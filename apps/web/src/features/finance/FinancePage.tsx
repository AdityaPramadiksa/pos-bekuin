import type { ExpenseCategoryView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { api, errorMessage } from '@/lib/api';
import { useExpenseCategories } from '@/lib/queries';
import { ExpensesTab } from './ExpensesTab';
import { ShiftTab } from './ShiftTab';

const TABS = [
  { key: 'shift', label: 'Shift Kasir' },
  { key: 'expenses', label: 'Pengeluaran' },
  { key: 'categories', label: 'Kategori' },
];

export function FinancePage() {
  const [tab, setTab] = useState(
    () => new URLSearchParams(window.location.search).get('tab') ?? 'shift',
  );
  return (
    <>
      <PageHeader title="Keuangan" subtitle="Shift kasir & pengeluaran operasional" />
      <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-6">
        <Chips value={tab} onChange={setTab} options={TABS} />
        {tab === 'shift' && <ShiftTab />}
        {tab === 'expenses' && <ExpensesTab />}
        {tab === 'categories' && <CategoriesTab />}
      </div>
    </>
  );
}

function CategoriesTab() {
  const queryClient = useQueryClient();
  const categories = useExpenseCategories(true);
  const [name, setName] = useState('');
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['finance'] });
  const create = useMutation({
    mutationFn: () => api.post('/expense-categories', { name }),
    onSuccess: () => {
      setName('');
      toast.success('Kategori ditambahkan');
      void refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: Partial<ExpenseCategoryView> & { id: string }) =>
      api.patch(`/expense-categories/${id}`, body),
    onSuccess: () => void refresh(),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (categories.isPending) return <LoadingState />;
  if (categories.isError)
    return <ErrorState error={categories.error} onRetry={() => categories.refetch()} />;
  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length >= 2) create.mutate();
        }}
      >
        <Input
          placeholder="Nama kategori baru"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={name.trim().length < 2} loading={create.isPending}>
          <Plus className="size-4" /> Tambah
        </Button>
      </form>
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
        {categories.data.map((c) => (
          <li key={c.id} className="flex items-center gap-3 px-4 py-3">
            <Input
              aria-label={`Nama ${c.name}`}
              defaultValue={c.name}
              maxLength={40}
              className="h-9 flex-1"
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next.length >= 2 && next !== c.name) update.mutate({ id: c.id, name: next });
              }}
            />
            <Switch
              checked={c.isActive}
              onChange={(isActive) => update.mutate({ id: c.id, isActive })}
              label={c.isActive ? 'Aktif' : 'Nonaktif'}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
