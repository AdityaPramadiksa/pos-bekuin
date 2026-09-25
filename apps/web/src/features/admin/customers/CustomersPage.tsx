import type { CustomerView, OrderView } from '@bekuin/shared';
import { formatRupiah } from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GitMerge, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Chips } from '@/components/ui/chips';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { formatDateTime } from '@/features/orders/order-format';
import { api, errorMessage } from '@/lib/api';
import { useAliases, useCatalog, useCustomers } from '@/lib/queries';
import { useAuthStore } from '@/stores/auth';
import { getCartStore } from '@/stores/cart';

export function CustomersPage() {
  const [tab, setTab] = useState('customers');
  return (
    <>
      <PageHeader
        title="Pelanggan & Alias"
        subtitle="Data pelanggan dan ejaan produk untuk Tempel Pesan"
      />
      <div className="mx-auto max-w-3xl space-y-3 p-4 md:p-6">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { key: 'customers', label: 'Pelanggan' },
            { key: 'aliases', label: 'Alias Produk' },
          ]}
        />
        {tab === 'customers' ? <CustomersTab /> : <AliasesTab />}
      </div>
    </>
  );
}

function CustomersTab() {
  const [q, setQ] = useState('');
  const customers = useCustomers(q.trim());
  const [editing, setEditing] = useState<CustomerView | null>(null);
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" />
        <Input
          className="pl-9"
          placeholder="Cari nama / No. WA"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {customers.isPending ? (
        <LoadingState />
      ) : customers.isError ? (
        <ErrorState error={customers.error} onRetry={() => customers.refetch()} />
      ) : customers.data.length === 0 ? (
        <EmptyState
          title="Belum ada pelanggan"
          description="Pelanggan tersimpan otomatis saat namanya diisi di order."
        />
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {customers.data.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setEditing(c)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-stone-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-stone-500">
                    {c.phone ?? 'tanpa WA'} · {c.orderCount} order
                    {c.lastOrderAt ? ` · terakhir ${formatDateTime(c.lastOrderAt)}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold">{formatRupiah(c.totalSpent)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <CustomerDialog key={editing.id} customer={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function CustomerDialog({ customer, onClose }: { customer: CustomerView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id ?? 'anon');
  const catalog = useCatalog();
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone ?? '',
    note: customer.note ?? '',
  });
  const [dupQ, setDupQ] = useState('');
  const dupes = useCustomers(dupQ.trim());
  const [dupId, setDupId] = useState('');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['customers'] });

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/customers/${customer.id}`, {
        name: form.name,
        phone: form.phone || null,
        note: form.note || null,
      }),
    onSuccess: () => {
      toast.success('Pelanggan disimpan');
      refresh();
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const merge = useMutation({
    mutationFn: () => api.post(`/customers/${customer.id}/merge`, { duplicateId: dupId }),
    onSuccess: () => {
      toast.success('Pelanggan digabung; semua order pindah ke data ini');
      refresh();
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  /** Salin isi order terakhir ke keranjang POS admin. */
  const reorder = useMutation({
    mutationFn: async () =>
      (await api.get<OrderView | null>(`/customers/${customer.id}/last-order`)).data,
    onSuccess: (order) => {
      if (!order) return toast.info('Pelanggan ini belum punya order');
      const cart = getCartStore(`pos-${userId}`).getState();
      cart.clear();
      let skipped = 0;
      for (const item of order.items) {
        const product = catalog.data?.products.find((p) =>
          p.variants.some((v) => v.id === item.variantId),
        );
        const variant = product?.variants.find((v) => v.id === item.variantId);
        const category = catalog.data?.categories.find((c) => c.id === variant?.categoryId);
        if (!product || !variant || !category) {
          skipped++;
          continue;
        }
        cart.add(
          {
            variantId: variant.id,
            productId: product.id,
            productName: product.name,
            categoryId: category.id,
            categoryCode: category.code,
            categoryName: category.name,
            packSize: variant.packSize,
            price: variant.price,
          },
          item.qty,
        );
      }
      cart.setMeta({ customerName: customer.name, customerPhone: customer.phone ?? '' });
      toast.success(
        `Order terakhir disalin ke keranjang${skipped ? ` (${skipped} menu sudah tidak tersedia)` : ''}`,
      );
      navigate('/admin/order/baru');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={customer.name}
      description={`${customer.orderCount} order · ${formatRupiah(customer.totalSpent)}`}
      footer={
        <>
          <Button variant="outline" loading={reorder.isPending} onClick={() => reorder.mutate()}>
            <RotateCcw className="size-4" /> Order ulang
          </Button>
          <Button
            loading={save.isPending}
            disabled={form.name.trim().length < 2}
            onClick={() => save.mutate()}
          >
            Simpan
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nama">
          <Input
            value={form.name}
            maxLength={60}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="No. WhatsApp">
          <Input
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>
        <Field label="Catatan">
          <Textarea
            className="min-h-14"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </Field>
        <div className="space-y-2 border-t border-stone-100 pt-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <GitMerge className="size-4" /> Gabungkan data ganda ke pelanggan ini
          </p>
          <Input
            placeholder="Cari duplikat, misal: Ibu Sri"
            value={dupQ}
            onChange={(e) => setDupQ(e.target.value)}
          />
          <div className="flex gap-2">
            <Select value={dupId} onChange={(e) => setDupId(e.target.value)}>
              <option value="">— Pilih pelanggan duplikat —</option>
              {(dupes.data ?? [])
                .filter((d) => d.id !== customer.id)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.orderCount} order)
                  </option>
                ))}
            </Select>
            <Button
              variant="outline"
              disabled={!dupId}
              loading={merge.isPending}
              onClick={() =>
                window.confirm('Gabungkan? Semua order duplikat pindah ke pelanggan ini.') &&
                merge.mutate()
              }
            >
              Gabung
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function AliasesTab() {
  const queryClient = useQueryClient();
  const aliases = useAliases();
  const catalog = useCatalog();
  const [form, setForm] = useState({ alias: '', productId: '' });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['aliases'] });
  const add = useMutation({
    mutationFn: () => api.post('/product-aliases', form),
    onSuccess: () => {
      setForm({ alias: '', productId: form.productId });
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/product-aliases/${id}`),
    onSuccess: refresh,
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <Input
          placeholder="Ejaan, misal: dimsam ori"
          value={form.alias}
          onChange={(e) => setForm({ ...form, alias: e.target.value })}
        />
        <Select
          value={form.productId}
          onChange={(e) => setForm({ ...form, productId: e.target.value })}
        >
          <option value="">— Produk —</option>
          {(catalog.data?.products ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button
          disabled={form.alias.trim().length < 2 || !form.productId}
          loading={add.isPending}
          onClick={() => add.mutate()}
        >
          Tambah
        </Button>
      </div>
      {aliases.isPending ? (
        <LoadingState />
      ) : aliases.isError ? (
        <ErrorState error={aliases.error} />
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm">
          {aliases.data.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-mono">{a.alias}</span>
              <span className="text-stone-400">→</span>
              <span className="flex-1 font-medium">{a.productName}</span>
              <button
                aria-label="Hapus alias"
                className="text-stone-400 hover:text-red-600"
                onClick={() => remove.mutate(a.id)}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
