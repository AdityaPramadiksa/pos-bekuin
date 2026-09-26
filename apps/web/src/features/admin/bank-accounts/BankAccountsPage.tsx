import type { BankAccountView } from '@bekuin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { SwitchRow } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { queryKeys, usePaymentMethods } from '@/lib/queries';
import { cn } from '@/lib/utils';

const KEY = ['bank-accounts'];

/**
 * Rekening tujuan Transfer. Pelanggan yang memilih bayar Transfer melihat semua rekening aktif
 * lengkap dengan tombol salin, lalu wajib mengunggah bukti transfer.
 */
export function BankAccountsPage() {
  const accounts = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<BankAccountView[]>('/bank-accounts')).data,
  });
  const [editing, setEditing] = useState<BankAccountView | 'new' | null>(null);
  const activeCount = accounts.data?.filter((a) => a.isActive).length ?? 0;

  return (
    <>
      <PageHeader
        title="Rekening Bank"
        subtitle="Tujuan transfer pelanggan"
        action={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Rekening
          </Button>
        }
      />
      <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
        <TransferToggle hasAccounts={activeCount > 0} />
        {accounts.isPending ? (
          <LoadingState rows={3} />
        ) : accounts.isError ? (
          <ErrorState error={accounts.error} onRetry={() => accounts.refetch()} />
        ) : accounts.data.length === 0 ? (
          <EmptyState
            title="Belum ada rekening"
            description="Tambahkan rekening supaya pelanggan bisa memilih bayar Transfer."
            action={
              <Button onClick={() => setEditing('new')}>
                <Plus className="size-4" /> Tambah rekening
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
            {accounts.data.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => setEditing(a)}
                  className={cn(
                    'flex w-full items-center gap-3 p-4 text-left hover:bg-stone-50',
                    !a.isActive && 'opacity-60',
                  )}
                >
                  <Landmark className="text-brand-700 size-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="font-semibold">{a.bankName}</p>
                      {!a.isActive && <Badge>Nonaktif</Badge>}
                    </div>
                    <p className="text-lg font-bold tracking-wide tabular-nums">
                      {a.accountNumber}
                    </p>
                    <p className="text-sm text-stone-500">a.n. {a.accountName}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Tambah rekening' : 'Ubah rekening'}
      >
        {editing !== null && (
          <AccountForm
            key={editing === 'new' ? 'new' : editing.id}
            current={editing === 'new' ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
    </>
  );
}

/** Tampilkan pilihan Transfer ke pelanggan (metode bayar bertipe Transfer). */
function TransferToggle({ hasAccounts }: { hasAccounts: boolean }) {
  const queryClient = useQueryClient();
  const methods = usePaymentMethods(true);
  const transfer = methods.data?.find((m) => m.type === 'TRANSFER');
  const toggle = useMutation({
    mutationFn: (showToCustomer: boolean) =>
      api.patch(`/payment-methods/${transfer!.id}`, {
        showToCustomer,
        ...(showToCustomer ? { isActive: true } : {}),
      }),
    onSuccess: (_d, on) => {
      toast.success(on ? 'Transfer tampil ke pelanggan' : 'Transfer disembunyikan dari pelanggan');
      void queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!transfer) return null;
  const on = transfer.showToCustomer && transfer.isActive;
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <SwitchRow
        title="Pelanggan boleh bayar Transfer"
        description={
          !on
            ? 'Aktifkan supaya pilihan Transfer muncul di link order online'
            : hasAccounts
              ? 'Pilihan Transfer tampil beserta rekening aktif di bawah'
              : 'Belum ada rekening aktif, jadi Transfer belum tampil ke pelanggan'
        }
        checked={on}
        onChange={(v) => toggle.mutate(v)}
      />
    </section>
  );
}

function AccountForm({ current, onDone }: { current: BankAccountView | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    bankName: current?.bankName ?? '',
    accountNumber: current?.accountNumber ?? '',
    accountName: current?.accountName ?? '',
    isActive: current?.isActive ?? true,
  });
  const digits = form.accountNumber.replace(/[\s-]/g, '');
  const invalid =
    form.bankName.trim().length < 2 ||
    !/^\d{5,25}$/.test(digits) ||
    form.accountName.trim().length < 2;

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        bankName: form.bankName.trim(),
        accountNumber: digits,
        accountName: form.accountName.trim(),
      };
      if (current)
        await api.patch(`/bank-accounts/${current.id}`, { ...body, isActive: form.isActive });
      else await api.post('/bank-accounts', body);
    },
    onSuccess: () => {
      toast.success('Rekening disimpan');
      void queryClient.invalidateQueries({ queryKey: KEY });
      onDone();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!invalid) save.mutate();
  };

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Field label="Nama bank / e-wallet">
        <Input
          autoFocus
          value={form.bankName}
          maxLength={40}
          placeholder="BCA, BRI, Mandiri, SeaBank…"
          onChange={(e) => setForm({ ...form, bankName: e.target.value })}
        />
      </Field>
      <Field
        label="Nomor rekening"
        hint={
          form.accountNumber && !/^\d{5,25}$/.test(digits) ? 'Hanya angka, 5–25 digit' : undefined
        }
      >
        <Input
          inputMode="numeric"
          value={form.accountNumber}
          maxLength={30}
          placeholder="1234567890"
          onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
        />
      </Field>
      <Field label="Atas nama">
        <Input
          value={form.accountName}
          maxLength={80}
          placeholder="Nama pemilik rekening"
          onChange={(e) => setForm({ ...form, accountName: e.target.value })}
        />
      </Field>
      {current && (
        <SwitchRow
          title="Aktif"
          description="Rekening nonaktif tidak ditampilkan ke pelanggan"
          checked={form.isActive}
          onChange={(isActive) => setForm({ ...form, isActive })}
        />
      )}
      <Button type="submit" className="w-full" disabled={invalid} loading={save.isPending}>
        Simpan
      </Button>
    </form>
  );
}
