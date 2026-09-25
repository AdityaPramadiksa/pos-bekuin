import { formatRupiah, type PublicMenuResponse } from '@bekuin/shared';
import { Bike, Check, Store, type LucideIcon } from 'lucide-react';
import { Field, Input, Textarea } from '@/components/ui/input';
import { dateKeyWita, formatDateKey } from '@/features/orders/order-format';
import { cn } from '@/lib/utils';

export interface OnlineDelivery {
  method: 'PICKUP' | 'DELIVERY';
  address: string;
  /** YYYY-MM-DD (WITA) */
  date: string;
}

type OnlineInfo = NonNullable<PublicMenuResponse['online']>;

const addDays = (key: string, days: number) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function dayLabel(key: string) {
  if (key === dateKeyWita(0)) return 'Hari ini';
  if (key === dateKeyWita(1)) return 'Besok';
  return formatDateKey(key);
}

/** Isian khusus link order online: No. WA, ambil/antar, alamat, tanggal kirim. */
export function OnlineFields({
  online,
  phone,
  onPhone,
  value,
  onChange,
  deliveryFee,
}: {
  online: OnlineInfo;
  phone: string;
  onPhone: (phone: string) => void;
  value: OnlineDelivery;
  onChange: (value: OnlineDelivery) => void;
  deliveryFee: number;
}) {
  const set = (patch: Partial<OnlineDelivery>) => onChange({ ...value, ...patch });
  const dateChips = [online.earliestDate, addDays(online.earliestDate, 1)].filter(
    (d) => d <= online.latestDate,
  );
  const methods: {
    key: OnlineDelivery['method'];
    label: string;
    hint: string;
    icon: LucideIcon;
  }[] = [
    ...(online.deliveryEnabled
      ? [
          {
            key: 'DELIVERY' as const,
            label: 'Diantar',
            hint:
              online.freeDeliveryMin > 0
                ? `Ongkir ${formatRupiah(online.deliveryFee)}, gratis mulai ${formatRupiah(online.freeDeliveryMin)}`
                : online.deliveryFee > 0
                  ? `Ongkir ${formatRupiah(online.deliveryFee)}`
                  : 'Gratis ongkir',
            icon: Bike,
          },
        ]
      : []),
    {
      key: 'PICKUP',
      label: 'Ambil sendiri',
      hint: online.pickupAddress ? `Di ${online.pickupAddress}` : 'Ambil di toko',
      icon: Store,
    },
  ];

  return (
    <div className="space-y-4">
      <Field label="No. WhatsApp" hint="Untuk konfirmasi & info pengantaran">
        <Input
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          maxLength={20}
          placeholder="08…"
          onChange={(e) => onPhone(e.target.value)}
        />
      </Field>

      <div>
        <p className="mb-2 text-sm font-medium">Pesanan diterima dengan</p>
        <div role="radiogroup" aria-label="Cara terima pesanan" className="grid gap-2">
          {methods.map((m) => {
            const selected = value.method === m.key;
            return (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => set({ method: m.key })}
                className={cn(
                  'flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 text-left',
                  selected
                    ? 'border-brand-700 bg-brand-50 ring-brand-700 ring-1'
                    : 'border-stone-300 bg-white',
                )}
              >
                <m.icon
                  className={cn('size-6 shrink-0', selected ? 'text-brand-700' : 'text-stone-500')}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{m.label}</span>
                  <span className="block text-xs text-stone-500">{m.hint}</span>
                </span>
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full border',
                    selected ? 'border-brand-700 bg-brand-700 text-white' : 'border-stone-300',
                  )}
                >
                  {selected && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {value.method === 'DELIVERY' && (
        <Field
          label="Alamat pengantaran"
          hint={online.deliveryNote ?? 'Tulis alamat lengkap + patokan'}
        >
          <Textarea
            className="min-h-20"
            value={value.address}
            maxLength={300}
            autoComplete="street-address"
            placeholder="Jl. …, No. …, patokan (dekat …)"
            onChange={(e) => set({ address: e.target.value })}
          />
        </Field>
      )}

      <div>
        <p className="mb-2 text-sm font-medium">
          {value.method === 'DELIVERY' ? 'Tanggal diantar' : 'Tanggal diambil'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {dateChips.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => set({ date: d })}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium',
                value.date === d
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-stone-300 bg-white',
              )}
            >
              {dayLabel(d)}
            </button>
          ))}
          <Input
            type="date"
            aria-label="Pilih tanggal lain"
            className="h-9 w-40"
            min={online.earliestDate}
            max={online.latestDate}
            value={value.date}
            onChange={(e) => e.target.value && set({ date: e.target.value })}
          />
        </div>
        {value.date && !dateChips.includes(value.date) && (
          <p className="mt-1 text-xs text-stone-500">{formatDateKey(value.date)}</p>
        )}
      </div>

      {value.method === 'DELIVERY' && deliveryFee === 0 && online.deliveryFee > 0 && (
        <p className="rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">
          Pesananmu dapat gratis ongkir.
        </p>
      )}
    </div>
  );
}
