import type { TableView } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, ExternalLink, Plus, Printer, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { SwitchRow } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { useTables } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { isLocalOrigin, tableUrl } from './qr';
import { useQrImage } from './useQrImage';

export function TablesPage() {
  const tables = useTables();
  const [editing, setEditing] = useState<TableView | 'new' | null>(null);

  return (
    <>
      <PageHeader
        title="Meja & QR"
        subtitle="QR self-order untuk ditempel di meja"
        action={
          <div className="flex gap-2">
            <Link to="/cetak/qr-meja" target="_blank">
              <Button variant="outline" size="sm">
                <Printer className="size-4" /> Cetak semua
              </Button>
            </Link>
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="size-4" /> Meja
            </Button>
          </div>
        }
      />
      <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-6">
        {isLocalOrigin() && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            QR sekarang berisi alamat <b>{window.location.origin}</b> yang hanya bisa dibuka di
            laptop ini. Untuk dicoba di HP, buka halaman ini lewat IP laptop (misal{' '}
            <code>http://192.168.1.10:5173</code>). Untuk dipakai sungguhan, isi{' '}
            <code>VITE_PUBLIC_WEB_URL</code> dengan domain HTTPS toko.
          </p>
        )}
        {tables.isPending ? (
          <LoadingState />
        ) : tables.isError ? (
          <ErrorState error={tables.error} onRetry={() => tables.refetch()} />
        ) : tables.data.length === 0 ? (
          <EmptyState
            title="Belum ada meja"
            action={<Button onClick={() => setEditing('new')}>Tambah meja</Button>}
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {tables.data.map((t) => (
              <li key={t.id}>
                <TableCard table={t} onEdit={() => setEditing(t)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <TableDialog
        key={editing === 'new' ? 'new' : editing?.id}
        table={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

function TableCard({ table, onEdit }: { table: TableView; onEdit: () => void }) {
  const queryClient = useQueryClient();
  const qr = useQrImage(table.qrToken);
  const rotate = useMutation({
    mutationFn: () => api.post(`/tables/${table.id}/rotate-qr`),
    onSuccess: () => {
      toast.success(`QR ${table.name} diganti. Cetak ulang dan tempel QR baru.`);
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div
      className={cn(
        'flex gap-3 rounded-2xl bg-white p-3 shadow-sm',
        !table.isActive && 'opacity-60',
      )}
    >
      <div className="size-28 shrink-0 rounded-xl border border-stone-200 bg-white p-1">
        {qr.data && <img src={qr.data} alt={`QR ${table.name}`} className="size-full" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <button onClick={onEdit} className="text-left">
          <p className="font-semibold">{table.name}</p>
          <p className="text-xs text-stone-500">
            {table.code} {!table.isActive && <Badge>Nonaktif</Badge>}
          </p>
        </button>
        <div className="mt-auto flex flex-wrap gap-1 pt-2">
          {qr.data && (
            <a href={qr.data} download={`qr-${table.code}.png`}>
              <Button variant="outline" size="sm">
                <Download className="size-3.5" /> PNG
              </Button>
            </a>
          )}
          <a href={tableUrl(table.qrToken!)} target="_blank" rel="noreferrer">
            <Button variant="ghost" size="sm">
              <ExternalLink className="size-3.5" /> Buka
            </Button>
          </a>
          <Button
            variant="ghost"
            size="sm"
            loading={rotate.isPending}
            onClick={() =>
              window.confirm(`Ganti QR ${table.name}? QR lama langsung tidak berlaku.`) &&
              rotate.mutate()
            }
          >
            <RefreshCw className="size-3.5" /> Ganti QR
          </Button>
        </div>
      </div>
    </div>
  );
}

function TableDialog({ table, onClose }: { table: TableView | 'new' | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isNew = table === 'new';
  const current = table && table !== 'new' ? table : null;
  const [form, setForm] = useState({
    code: current?.code ?? '',
    name: current?.name ?? '',
    isActive: current?.isActive ?? true,
  });
  const save = useMutation({
    mutationFn: async (): Promise<void> => {
      if (isNew) await api.post('/tables', { code: form.code, name: form.name });
      else await api.patch(`/tables/${current!.id}`, form);
    },
    onSuccess: () => {
      toast.success('Meja disimpan');
      void queryClient.invalidateQueries({ queryKey: ['tables'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <Dialog
      open={table !== null}
      onClose={onClose}
      title={isNew ? 'Tambah Meja' : `Edit ${current?.name ?? ''}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            disabled={!form.code || !form.name.trim()}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Kode" hint="Misal M07. TAKEAWAY = QR kasir/bawa pulang">
          <Input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
          />
        </Field>
        <Field label="Nama tampil">
          <Input
            value={form.name}
            maxLength={40}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Meja 7"
          />
        </Field>
        {!isNew && (
          <SwitchRow
            title="Aktif"
            description="Nonaktif = QR menampilkan 'QR tidak valid'"
            checked={form.isActive}
            onChange={(isActive) => setForm({ ...form, isActive })}
          />
        )}
      </div>
    </Dialog>
  );
}
