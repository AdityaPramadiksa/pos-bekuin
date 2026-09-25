import { formatRupiah, type CashSessionView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LockOpen, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, MoneyInput } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { dateKeyWita, formatDateTime } from '@/features/orders/order-format';
import { api, errorMessage } from '@/lib/api';
import { useCurrentShift, useSettings, useShifts } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { shiftLines } from './print';
import { PrintPreview } from './PrintPreview';

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className={cn('flex justify-between py-1 text-sm', bold && 'font-semibold')}>
    <span className={bold ? '' : 'text-stone-600'}>{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

export function ShiftTab() {
  const current = useCurrentShift();
  const history = useShifts(dateKeyWita(-30), dateKeyWita(0));
  const [printing, setPrinting] = useState<CashSessionView | null>(null);

  return (
    <div className="space-y-4">
      {current.isPending ? (
        <LoadingState rows={2} />
      ) : current.isError ? (
        <ErrorState error={current.error} onRetry={() => current.refetch()} />
      ) : current.data ? (
        <OpenShift session={current.data} onClosed={setPrinting} />
      ) : (
        <OpenShiftForm />
      )}

      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">
          Riwayat 30 hari
        </h2>
        {history.isPending ? (
          <LoadingState rows={2} />
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => history.refetch()} />
        ) : history.data.filter((s) => s.status === 'CLOSED').length === 0 ? (
          <EmptyState title="Belum ada shift yang ditutup" />
        ) : (
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
            {history.data
              .filter((s) => s.status === 'CLOSED')
              .map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{formatDateTime(s.openedAt)}</p>
                    <p className="text-xs text-stone-500">
                      {s.summary.orders} order · {formatRupiah(s.summary.sales)} ·{' '}
                      {s.closedByName ?? s.openedByName}
                    </p>
                  </div>
                  <DifferenceBadge value={s.difference ?? 0} />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Lihat & cetak"
                    onClick={() => setPrinting(s)}
                  >
                    <Printer className="size-4" />
                  </Button>
                </li>
              ))}
          </ul>
        )}
      </section>
      {printing && <ShiftPrintDialog session={printing} onClose={() => setPrinting(null)} />}
    </div>
  );
}

function DifferenceBadge({ value }: { value: number }) {
  if (value === 0) return <Badge tone="green">Pas</Badge>;
  return (
    <Badge tone={value < 0 ? 'red' : 'amber'}>
      {value < 0 ? 'Kurang ' : 'Lebih '}
      {formatRupiah(Math.abs(value))}
    </Badge>
  );
}

function OpenShiftForm() {
  const queryClient = useQueryClient();
  const [openingCash, setOpeningCash] = useState<number | ''>('');
  const open = useMutation({
    mutationFn: () => api.post('/cash-sessions/open', { openingCash: openingCash || 0 }),
    onSuccess: () => {
      toast.success('Shift dibuka');
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <LockOpen className="text-brand-700 size-5" />
        <h2 className="font-semibold">Buka shift kasir</h2>
      </div>
      <p className="text-sm text-stone-600">
        Hitung uang di laci dulu, lalu isi sebagai modal awal. Approve pembayaran cash hanya bisa
        saat shift terbuka.
      </p>
      <Field label="Modal awal di laci">
        <MoneyInput value={openingCash} onChange={setOpeningCash} placeholder="200.000" />
      </Field>
      <Button className="w-full" loading={open.isPending} onClick={() => open.mutate()}>
        Buka shift
      </Button>
    </section>
  );
}

function OpenShift({
  session,
  onClosed,
}: {
  session: CashSessionView;
  onClosed: (s: CashSessionView) => void;
}) {
  const [closing, setClosing] = useState(false);
  const s = session.summary;
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Badge tone="green">Shift terbuka</Badge>
          <p className="mt-1 text-sm text-stone-600">
            Sejak {formatDateTime(session.openedAt)} · {session.openedByName}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setClosing(true)}>
          Tutup shift
        </Button>
      </div>
      <div className="mt-3 divide-y divide-stone-100">
        <div className="pb-2">
          <Row label="Order lunas" value={String(s.orders)} />
          <Row label="Penjualan (semua metode)" value={formatRupiah(s.sales)} />
          {s.byMethod.map((m) => (
            <Row key={m.key} label={`· ${m.label} (${m.count})`} value={formatRupiah(m.amount)} />
          ))}
        </div>
        <div className="pt-2">
          <Row label="Modal awal" value={formatRupiah(session.openingCash)} />
          <Row label="+ Penjualan cash" value={formatRupiah(s.cashSales)} />
          <Row label="− Pengeluaran cash" value={formatRupiah(s.cashExpenses)} />
          <Row label="Kas seharusnya di laci" value={formatRupiah(s.expectedCash)} bold />
        </div>
      </div>
      {closing && (
        <CloseShiftDialog
          session={session}
          onClose={() => setClosing(false)}
          onClosed={(closed) => {
            setClosing(false);
            onClosed(closed);
          }}
        />
      )}
    </section>
  );
}

function CloseShiftDialog({
  session,
  onClose,
  onClosed,
}: {
  session: CashSessionView;
  onClose: () => void;
  onClosed: (s: CashSessionView) => void;
}) {
  const queryClient = useQueryClient();
  const [counted, setCounted] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const expected = session.summary.expectedCash;
  const difference = counted === '' ? null : counted - expected;
  const close = useMutation({
    mutationFn: async () =>
      (
        await api.post<CashSessionView>(`/cash-sessions/${session.id}/close`, {
          countedCash: counted,
          note: note || null,
        })
      ).data,
    onSuccess: (closed) => {
      toast.success('Shift ditutup');
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      onClosed(closed);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title="Tutup shift"
      description="Hitung uang fisik di laci, lalu masukkan jumlahnya."
      footer={
        <Button
          disabled={counted === '' || (difference !== 0 && !note.trim())}
          loading={close.isPending}
          onClick={() => close.mutate()}
        >
          Tutup shift
        </Button>
      }
    >
      <div className="space-y-3">
        <Row label="Kas seharusnya" value={formatRupiah(expected)} bold />
        <Field label="Uang fisik di laci">
          <MoneyInput autoFocus value={counted} onChange={setCounted} />
        </Field>
        {difference !== null && (
          <div
            className={cn(
              'rounded-lg p-3 text-sm font-semibold',
              difference === 0
                ? 'bg-green-50 text-green-800'
                : difference < 0
                  ? 'bg-red-50 text-red-700'
                  : 'bg-amber-50 text-amber-800',
            )}
          >
            {difference === 0
              ? 'Pas, tidak ada selisih.'
              : `${difference < 0 ? 'Kurang' : 'Lebih'} ${formatRupiah(Math.abs(difference))}`}
          </div>
        )}
        <Field
          label={difference ? 'Catatan selisih (wajib)' : 'Catatan (opsional)'}
          hint={difference ? 'mis. salah kembalian, uang belum disetor' : undefined}
        >
          <Input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

export function ShiftPrintDialog({
  session,
  onClose,
}: {
  session: CashSessionView;
  onClose: () => void;
}) {
  const settings = useSettings();
  return (
    <Dialog open onClose={onClose} title="Rekap tutup shift">
      {settings.data ? (
        <PrintPreview lines={shiftLines(session, settings.data)} label="Cetak rekap shift" />
      ) : (
        <LoadingState rows={3} />
      )}
    </Dialog>
  );
}
