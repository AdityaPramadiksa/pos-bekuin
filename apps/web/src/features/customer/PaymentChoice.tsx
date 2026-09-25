import type { PaymentType, PublicPaymentMethod } from '@bekuin/shared';
import { Banknote, Check, Landmark, QrCode, Wallet, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sortCustomerMethods } from './payment-methods';

const ICON: Record<PaymentType, LucideIcon> = {
  QRIS: QrCode,
  CASH: Banknote,
  TRANSFER: Landmark,
  EWALLET: Wallet,
};

const HINT: Partial<Record<PaymentType, string>> = {
  QRIS: 'DANA, GoPay, OVO, ShopeePay, m-banking',
};

/** Pilihan cara bayar pelanggan: kartu radio besar, satu ketukan. */
export function PaymentChoice({
  methods,
  value,
  onChange,
  hints,
}: {
  methods: PublicPaymentMethod[];
  value: string | null;
  onChange: (id: string) => void;
  /** Keterangan tambahan per tipe (mis. Cash = COD untuk pesanan online). */
  hints?: Partial<Record<PaymentType, string>>;
}) {
  if (methods.length === 0) {
    return (
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Pembayaran lewat meja belum tersedia. Silakan pesan di kasir.
      </p>
    );
  }
  return (
    <div role="radiogroup" aria-label="Cara bayar" className="grid gap-2">
      {sortCustomerMethods(methods).map((m) => {
        const Icon = ICON[m.type];
        const hint = hints?.[m.type] ?? HINT[m.type];
        const selected = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(m.id)}
            className={cn(
              'flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
              selected
                ? 'border-brand-700 bg-brand-50 ring-brand-700 ring-1'
                : 'border-stone-300 bg-white',
            )}
          >
            <Icon
              className={cn('size-6 shrink-0', selected ? 'text-brand-700' : 'text-stone-500')}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{m.name}</span>
              {hint && <span className="block text-xs text-stone-500">{hint}</span>}
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
  );
}
