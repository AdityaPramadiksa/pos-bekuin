import type { PaymentMethodView, PaymentType } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { SwitchRow } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { queryKeys, usePaymentMethods } from '@/lib/queries';
import { cn } from '@/lib/utils';

const TYPE_LABEL: Record<PaymentType, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer bank',
  QRIS: 'QRIS',
  EWALLET: 'E-wallet',
};

export function PaymentMethodsPage() {
  const methods = usePaymentMethods(true);
  const [editing, setEditing] = useState<PaymentMethodView | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Metode Bayar"
        subtitle="Pilihan pembayaran saat approve order"
        action={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> Metode
          </Button>
        }
      />
      <div className="mx-auto max-w-2xl p-4 md:p-6">
        {methods.isPending ? (
          <LoadingState rows={3} />
        ) : methods.isError ? (
          <ErrorState error={methods.error} onRetry={() => methods.refetch()} />
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
            {methods.data.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => setEditing(m)}
                  className={cn(
                    'w-full p-4 text-left hover:bg-stone-50',
                    !m.isActive && 'opacity-60',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-medium">{m.name}</p>
                    <Badge>{TYPE_LABEL[m.type]}</Badge>
                    {m.showToCustomer && <Badge tone="blue">Tampil di QR pelanggan</Badge>}
                    {!m.isActive && <Badge>Nonaktif</Badge>}
                  </div>
                  {m.accountInfo && (
                    <p className="mt-0.5 text-xs text-stone-500">{m.accountInfo}</p>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <MethodDialog
        key={editing === 'new' ? 'new' : editing?.id}
        method={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function MethodDialog({
  method,
  onClose,
}: {
  method: PaymentMethodView | 'new' | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const isNew = method === 'new';
  const current = method && method !== 'new' ? method : null;
  const [form, setForm] = useState({
    name: current?.name ?? '',
    type: (current?.type ?? 'TRANSFER') as PaymentType,
    accountInfo: current?.accountInfo ?? '',
    showToCustomer: current?.showToCustomer ?? false,
    isActive: current?.isActive ?? true,
  });

  const save = useMutation({
    mutationFn: async (): Promise<void> => {
      const body = { ...form, accountInfo: form.accountInfo.trim() || null };
      if (isNew) {
        const { isActive: _ignored, ...createBody } = body;
        await api.post('/payment-methods', createBody);
      } else {
        await api.patch(`/payment-methods/${current!.id}`, body);
      }
    },
    onSuccess: () => {
      toast.success('Metode bayar disimpan');
      void queryClient.invalidateQueries({ queryKey: queryKeys.paymentMethods });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <Dialog
      open={method !== null}
      onClose={onClose}
      title={isNew ? 'Tambah Metode Bayar' : `Edit ${current?.name ?? ''}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="submit"
            form="method-form"
            loading={save.isPending}
            disabled={form.name.trim().length < 2}
          >
            Simpan
          </Button>
        </>
      }
    >
      <form id="method-form" onSubmit={onSubmit} className="space-y-4">
        <Field label="Nama" hint="Misal: Transfer BCA, ShopeePay, Dana">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Jenis">
          <Select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as PaymentType })}
          >
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Info rekening / akun (opsional)" hint="Tampil saat admin memilih metode ini">
          <Input
            placeholder="BCA 1234567890 a.n. Bekuin"
            value={form.accountInfo}
            onChange={(e) => setForm({ ...form, accountInfo: e.target.value })}
          />
        </Field>
        <SwitchRow
          title="Tampil di self-order QR"
          description="Pelanggan bisa memilih metode ini saat pesan dari meja"
          checked={form.showToCustomer}
          onChange={(showToCustomer) => setForm({ ...form, showToCustomer })}
        />
        {!isNew && (
          <SwitchRow
            title="Aktif"
            checked={form.isActive}
            onChange={(isActive) => setForm({ ...form, isActive })}
          />
        )}
      </form>
    </Dialog>
  );
}
