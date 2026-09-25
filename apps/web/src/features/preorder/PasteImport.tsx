import {
  type CatalogResponse,
  formatRupiah,
  type ImportResult,
  type ParsedBatch,
  type ParsedCustomer,
  type ParsedLine,
} from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookmarkPlus, ClipboardPaste, Trash2, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { formatDateKey, dateKeyWita } from '@/features/orders/order-format';
import { api, errorMessage } from '@/lib/api';
import { useCatalog } from '@/lib/queries';
import { cn } from '@/lib/utils';

const STATUS_STYLE = {
  OK: 'border-l-green-500 bg-white',
  WARN: 'border-l-amber-400 bg-amber-50/60',
  ERROR: 'border-l-red-500 bg-red-50/70',
} as const;

/** Cocokkan ulang baris setelah diedit: varian ditemukan = hijau, tidak = merah. */
function resolveLine(
  line: ParsedLine,
  catalog: CatalogResponse,
  patch: Partial<ParsedLine>,
  manual = true,
): ParsedLine {
  const next = { ...line, ...patch };
  const product = catalog.products.find((p) => p.id === next.productId);
  const category = catalog.categories.find((c) => c.code === next.categoryCode);
  const variant = product?.variants.find(
    (v) => v.categoryId === category?.id && v.packSize === next.packSize,
  );
  if (!product)
    return {
      ...next,
      productName: null,
      variantId: null,
      price: null,
      subtotal: 0,
      status: 'ERROR',
      messages: ['Pilih produk'],
    };
  if (!variant) {
    return {
      ...next,
      productName: product.name,
      variantId: null,
      price: null,
      subtotal: 0,
      status: 'ERROR',
      messages: [`${product.name} ukuran/kategori ini tidak tersedia`],
    };
  }
  return {
    ...next,
    productName: product.name,
    variantId: variant.id,
    price: variant.price,
    subtotal: variant.price * next.qty,
    status: manual ? 'OK' : next.status,
    messages: manual ? [] : next.messages,
  };
}

export function PasteImport({ onSaved }: { onSaved?: (result: ImportResult) => void }) {
  const queryClient = useQueryClient();
  const catalog = useCatalog();
  const [text, setText] = useState('');
  const [fallbackDate, setFallbackDate] = useState(dateKeyWita(1));
  const [batch, setBatch] = useState<ParsedBatch | null>(null);

  const preview = useMutation({
    mutationFn: async () =>
      (await api.post<ParsedBatch>('/orders/import/preview', { text, deliveryDate: fallbackDate }))
        .data,
    onSuccess: setBatch,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post<ImportResult>('/orders/import', {
          rawText: text,
          deliveryDate: batch!.deliveryDate,
          customers: batch!.customers
            .filter((c) => c.lines.length > 0)
            .map((c) => ({
              name: c.name,
              items: c.lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
            })),
        })
      ).data,
    onSuccess: (result) => {
      toast.success(
        `${result.orders} order tersimpan (${result.packs} pack, ${formatRupiah(result.amount)})`,
      );
      setText('');
      setBatch(null);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      onSaved?.(result);
    },
    onError: (error) => toast.error(errorMessage(error), { duration: 8000 }),
  });

  const rememberAlias = useMutation({
    mutationFn: (vars: { alias: string; productId: string }) => api.post('/product-aliases', vars),
    onSuccess: (_d, vars) => toast.success(`"${vars.alias}" diingat untuk pesanan berikutnya`),
    onError: (error) => toast.error(errorMessage(error)),
  });

  const updateCustomer = (key: string, fn: (c: ParsedCustomer) => ParsedCustomer) =>
    setBatch((b) =>
      b ? { ...b, customers: b.customers.map((c) => (c.key === key ? recompute(fn(c)) : c)) } : b,
    );

  async function pasteFromClipboard() {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      toast.error('Izin clipboard ditolak. Tempel manual (tekan lama → Tempel).');
    }
  }

  const lines = batch?.customers.flatMap((c) => c.lines) ?? [];
  const errors = lines.filter((l) => l.status === 'ERROR').length;
  const warns = lines.filter((l) => l.status === 'WARN').length;
  const totals = {
    customers: batch?.customers.filter((c) => c.lines.length).length ?? 0,
    packs: lines.reduce((s, l) => s + (l.variantId ? l.qty : 0), 0),
    amount: lines.reduce((s, l) => s + l.subtotal, 0),
  };

  if (!batch) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 p-4">
        <div className="flex gap-2">
          <Button variant="outline" onClick={pasteFromClipboard}>
            <ClipboardPaste className="size-4" /> Tempel dari clipboard
          </Button>
          <Field label="" className="ml-auto">
            <Input
              type="date"
              aria-label="Tanggal kirim bawaan"
              value={fallbackDate}
              min={dateKeyWita(0)}
              onChange={(e) => setFallbackDate(e.target.value)}
            />
          </Field>
        </div>
        <Textarea
          className="min-h-72 font-mono text-sm"
          placeholder={
            'Oderan bsk\n\nBu Kusuma\n. Udang keju (6 pcs)\n. Dimsum ori 9 pcs x2\n\nMahayuda (mateng)\n. Risol mayo 6pcs'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <p className="text-xs text-stone-500">
          Tanggal kirim diambil dari kata &quot;besok/bsk/lusa&quot; di pesan; kalau tidak ada,
          pakai tanggal di atas.
        </p>
        <Button
          className="w-full"
          size="lg"
          disabled={!text.trim()}
          loading={preview.isPending}
          onClick={() => preview.mutate()}
        >
          <Wand2 className="size-5" /> Proses pesan
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4 pb-40">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setBatch(null)}>
          ← Ubah teks
        </Button>
        <Field label="" className="ml-auto">
          <Input
            type="date"
            aria-label="Tanggal kirim"
            value={batch.deliveryDate}
            min={dateKeyWita(0)}
            onChange={(e) => setBatch({ ...batch, deliveryDate: e.target.value })}
          />
        </Field>
      </div>
      <p className="text-sm text-stone-600">
        Kirim <b>{formatDateKey(batch.deliveryDate)}</b> ·{' '}
        {errors > 0 && <span className="text-red-600">{errors} baris merah · </span>}
        {warns > 0 && <span className="text-amber-700">{warns} baris kuning (cek dulu)</span>}
      </p>

      {batch.customers.map((c) =>
        c.lines.length === 0 ? null : (
          <section key={c.key} className="overflow-hidden rounded-2xl bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-stone-100 px-3 py-2">
              <Input
                aria-label="Nama pelanggan"
                className="h-9 flex-1 font-semibold"
                placeholder="(tanpa nama)"
                value={c.name}
                onChange={(e) => updateCustomer(c.key, (x) => ({ ...x, name: e.target.value }))}
              />
              {c.isNew && <Badge tone="blue">Baru</Badge>}
              {c.merged && <Badge tone="amber">Digabung</Badge>}
              <span className="font-bold whitespace-nowrap">{formatRupiah(c.total)}</span>
            </div>
            <ul>
              {c.lines.map((l, idx) => (
                <li
                  key={`${l.lineNo}-${idx}`}
                  className={cn('border-l-4 px-3 py-2', STATUS_STYLE[l.status])}
                >
                  <p className="font-mono text-xs text-stone-500">{l.raw}</p>
                  {catalog.data && (
                    <div className="mt-1 grid grid-cols-[1fr_1fr_3.5rem_2rem] items-center gap-1.5 sm:grid-cols-[1fr_6.5rem_5rem_3.5rem_2rem]">
                      <Select
                        aria-label="Produk"
                        className="col-span-4 h-9 sm:col-span-1"
                        value={l.productId ?? ''}
                        onChange={(e) =>
                          updateCustomer(c.key, (x) => ({
                            ...x,
                            lines: x.lines.map((y, i) =>
                              i === idx
                                ? resolveLine(y, catalog.data!, {
                                    productId: e.target.value || null,
                                  })
                                : y,
                            ),
                          }))
                        }
                      >
                        <option value="">— produk —</option>
                        {catalog.data.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </Select>
                      <Select
                        aria-label="Kategori"
                        className="h-9"
                        value={l.categoryCode}
                        onChange={(e) =>
                          updateCustomer(c.key, (x) => ({
                            ...x,
                            lines: x.lines.map((y, i) =>
                              i === idx
                                ? resolveLine(y, catalog.data!, { categoryCode: e.target.value })
                                : y,
                            ),
                          }))
                        }
                      >
                        {catalog.data.categories.map((cat) => (
                          <option key={cat.id} value={cat.code}>
                            {cat.name}
                          </option>
                        ))}
                      </Select>
                      <Select
                        aria-label="Isi"
                        className="h-9"
                        value={l.packSize ?? ''}
                        onChange={(e) =>
                          updateCustomer(c.key, (x) => ({
                            ...x,
                            lines: x.lines.map((y, i) =>
                              i === idx
                                ? resolveLine(y, catalog.data!, {
                                    packSize: Number(e.target.value),
                                  })
                                : y,
                            ),
                          }))
                        }
                      >
                        <option value="">isi</option>
                        {[
                          ...new Set(
                            catalog.data.products.flatMap((p) => p.variants.map((v) => v.packSize)),
                          ),
                        ]
                          .sort((a, b) => a - b)
                          .map((n) => (
                            <option key={n} value={n}>
                              {n} pcs
                            </option>
                          ))}
                      </Select>
                      <Input
                        aria-label="Jumlah"
                        type="number"
                        min={1}
                        className="h-9"
                        value={l.qty}
                        onChange={(e) =>
                          updateCustomer(c.key, (x) => ({
                            ...x,
                            lines: x.lines.map((y, i) =>
                              i === idx
                                ? resolveLine(
                                    y,
                                    catalog.data!,
                                    { qty: Math.max(1, Number(e.target.value) || 1) },
                                    false,
                                  )
                                : y,
                            ),
                          }))
                        }
                      />
                      <button
                        aria-label="Hapus baris"
                        className="text-stone-400 hover:text-red-600"
                        onClick={() =>
                          updateCustomer(c.key, (x) => ({
                            ...x,
                            lines: x.lines.filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    {l.messages.map((m) => (
                      <span
                        key={m}
                        className={l.status === 'ERROR' ? 'text-red-700' : 'text-amber-800'}
                      >
                        {m}
                      </span>
                    ))}
                    {l.status !== 'OK' && l.productId && l.productText && (
                      <button
                        className="text-brand-700 ml-auto inline-flex items-center gap-1 font-medium"
                        onClick={() =>
                          rememberAlias.mutate({ alias: l.productText, productId: l.productId! })
                        }
                      >
                        <BookmarkPlus className="size-3.5" /> Ingat &quot;{l.productText}&quot;
                        sebagai alias
                      </button>
                    )}
                    {l.subtotal > 0 && (
                      <span className="ml-auto font-medium text-stone-700">
                        {formatRupiah(l.subtotal)}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}

      {batch.ignoredLines.length > 0 && (
        <p className="text-xs text-stone-500">
          Baris diabaikan: {batch.ignoredLines.map((l) => l.raw).join(' · ')}
        </p>
      )}

      <div className="pb-safe fixed inset-x-0 bottom-16 z-20 border-t border-stone-200 bg-white px-4 py-3 md:bottom-0 md:left-56">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="text-sm">
            <p className="font-semibold">
              {totals.customers} pelanggan · {totals.packs} pack
            </p>
            <p className="text-stone-600">{formatRupiah(totals.amount)}</p>
          </div>
          <Button
            className="ml-auto"
            size="lg"
            disabled={errors > 0 || totals.customers === 0}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {errors > 0 ? `Perbaiki ${errors} baris merah` : 'Simpan semua'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function recompute(c: ParsedCustomer): ParsedCustomer {
  return { ...c, total: c.lines.reduce((s, l) => s + l.subtotal, 0) };
}
