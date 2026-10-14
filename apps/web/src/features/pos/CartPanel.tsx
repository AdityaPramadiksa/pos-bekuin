import { formatRupiah } from '@bekuin/shared';
import { Minus, Plus, ShoppingBasket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, MoneyInput, Textarea } from '@/components/ui/input';
import { QtyInput } from '@/components/ui/qty-input';
import { cn } from '@/lib/utils';
import { cartDeliveryFee, cartTotals, getCartStore, MAX_QTY_PER_ITEM } from '@/stores/cart';
import { dateKeyWita, formatDateKey } from '@/features/orders/order-format';
import { useCustomerSuggest } from '@/lib/queries';

export function CartPanel({
  cartKey,
  submitLabel,
  submitting,
  onSubmit,
  extraFields,
  allowDeliveryFee = false,
}: {
  cartKey: string;
  submitLabel: string;
  submitting: boolean;
  onSubmit: () => void;
  extraFields?: React.ReactNode;
  /** Admin boleh menambah ongkir; ikut ke total order & nota. */
  allowDeliveryFee?: boolean;
}) {
  const { lines, meta, setQty, setMeta, clear } = getCartStore(cartKey)();
  const totals = cartTotals(lines);
  const deliveryFee = cartDeliveryFee(meta, allowDeliveryFee);
  const receive = meta.deliveryMethod ?? 'PICKUP';
  const suggestions = useCustomerSuggest(meta.customerName);
  const today = dateKeyWita(0);
  const tomorrow = dateKeyWita(1);
  const delivery = meta.deliveryDate || today;

  // Kelompokkan per kategori: FROZEN / SIAP MAKAN
  const groups = new Map<string, typeof lines>();
  for (const l of lines) groups.set(l.categoryName, [...(groups.get(l.categoryName) ?? []), l]);

  return (
    <div className="flex h-full max-h-[80dvh] flex-col lg:max-h-none">
      <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
        <p className="flex items-center gap-2 font-semibold">
          <ShoppingBasket className="size-5" /> Keranjang
        </p>
        {lines.length > 0 && (
          <button
            onClick={() => window.confirm('Kosongkan keranjang?') && clear()}
            className="flex items-center gap-1 text-xs text-red-600"
          >
            <Trash2 className="size-3.5" /> Kosongkan
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-500">
            Belum ada item. Tap tombol + pada menu.
          </p>
        ) : (
          [...groups].map(([category, items]) => (
            <section key={category}>
              <p className="mb-1 text-xs font-bold tracking-wide text-stone-500 uppercase">
                {category}
              </p>
              <ul className="divide-y divide-stone-100">
                {items.map((l) => (
                  <li key={l.variantId} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {l.productName} {l.packSize}pcs
                      </p>
                      <p className="text-xs text-stone-500">
                        {l.qty} × {formatRupiah(l.price)} = <b>{formatRupiah(l.qty * l.price)}</b>
                      </p>
                    </div>
                    <button
                      aria-label="Kurangi"
                      onClick={() => setQty(l.variantId, l.qty - 1)}
                      className="flex size-8 items-center justify-center rounded-lg border border-stone-300"
                    >
                      <Minus className="size-4" />
                    </button>
                    <QtyInput
                      value={l.qty}
                      max={MAX_QTY_PER_ITEM}
                      label={`${l.productName} ${l.packSize} pcs`}
                      onChange={(n) => setQty(l.variantId, n)}
                      onClamp={(max) => toast.warning(`Maksimal ${max} pack per item`)}
                    />
                    <button
                      aria-label="Tambah"
                      onClick={() => setQty(l.variantId, l.qty + 1)}
                      className="flex size-8 items-center justify-center rounded-lg border border-stone-300"
                    >
                      <Plus className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}

        {lines.length > 0 && (
          <div className="space-y-3 border-t border-stone-100 pt-3">
            <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
              {(
                [
                  { value: 'PICKUP', label: 'Ambil sendiri' },
                  { value: 'DELIVERY', label: 'Diantar' },
                ] as const
              ).map((o) => (
                <button
                  key={o.value}
                  onClick={() => setMeta({ deliveryMethod: o.value })}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 text-sm font-medium',
                    receive === o.value ? 'bg-white shadow-sm' : 'text-stone-500',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <Field label="Nama pelanggan (opsional)">
              <Input
                value={meta.customerName}
                maxLength={60}
                list={`${cartKey}-customers`}
                autoComplete="off"
                onChange={(e) => setMeta({ customerName: e.target.value })}
              />
              <datalist id={`${cartKey}-customers`}>
                {(suggestions.data ?? []).map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.phone ?? ''}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field label="No. WA pelanggan (opsional)" hint="Untuk kirim nota lewat WhatsApp">
              <Input
                type="tel"
                inputMode="tel"
                value={meta.customerPhone}
                maxLength={20}
                placeholder="08xxxxxxxxxx"
                onChange={(e) => setMeta({ customerPhone: e.target.value })}
              />
            </Field>
            {receive === 'DELIVERY' && (
              <Field label="Alamat antar (opsional)">
                <Textarea
                  className="min-h-14"
                  value={meta.deliveryAddress ?? ''}
                  maxLength={200}
                  placeholder="Jalan, nomor rumah, patokan"
                  onChange={(e) => setMeta({ deliveryAddress: e.target.value })}
                />
              </Field>
            )}
            <div>
              <p className="mb-1 text-sm font-medium">
                {receive === 'DELIVERY' ? 'Tanggal antar' : 'Tanggal ambil'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: today, label: 'Hari ini' },
                  { key: tomorrow, label: 'Besok' },
                ].map((d) => (
                  <button
                    key={d.key}
                    onClick={() => setMeta({ deliveryDate: d.key === today ? '' : d.key })}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm',
                      delivery === d.key
                        ? 'border-brand-700 bg-brand-700 text-white'
                        : 'border-stone-300',
                    )}
                  >
                    {d.label}
                  </button>
                ))}
                <Input
                  type="date"
                  aria-label="Tanggal kirim"
                  className="h-8 w-40"
                  min={today}
                  value={delivery}
                  onChange={(e) =>
                    setMeta({ deliveryDate: e.target.value === today ? '' : e.target.value })
                  }
                />
              </div>
              {delivery !== today && (
                <p className="mt-1 text-xs text-amber-700">
                  Pre-order untuk {formatDateKey(delivery)} — stok dicek saat approve.
                </p>
              )}
            </div>
            {extraFields}
            {allowDeliveryFee && receive === 'DELIVERY' && (
              <Field
                label="Ongkir (opsional)"
                hint="Ditambahkan ke total dan tampil di nota pelanggan"
              >
                <MoneyInput
                  value={meta.deliveryFee || ''}
                  placeholder="0"
                  onChange={(v) => setMeta({ deliveryFee: v === '' ? 0 : Math.min(v, 1_000_000) })}
                />
              </Field>
            )}
            <Field label="Catatan (opsional)">
              <Textarea
                className="min-h-14"
                value={meta.note}
                maxLength={200}
                onChange={(e) => setMeta({ note: e.target.value })}
              />
            </Field>
          </div>
        )}
      </div>

      <div className="pb-safe border-t border-stone-200 px-4 py-3">
        {deliveryFee > 0 && (
          <div className="mb-1 flex justify-between text-sm text-stone-600">
            <span>
              Subtotal {formatRupiah(totals.total)} + ongkir {formatRupiah(deliveryFee)}
            </span>
          </div>
        )}
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm text-stone-600">{totals.packs} pack</span>
          <span className="text-xl font-bold">{formatRupiah(totals.total + deliveryFee)}</span>
        </div>
        <Button
          className="w-full"
          size="lg"
          disabled={lines.length === 0}
          loading={submitting}
          onClick={onSubmit}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
