import { Chips } from '@/components/ui/chips';
import { Input } from '@/components/ui/input';
import { dateKeyWita } from '@/features/orders/order-format';
import { PERIOD_OPTIONS, periodRange, type PeriodKey } from './periods';

export interface Period {
  key: PeriodKey;
  from: string;
  to: string;
}

/** Filter periode: preset dulu, tanggal bebas di belakang. */
export function PeriodFilter({
  value,
  onChange,
  single = false,
}: {
  value: Period;
  onChange: (p: Period) => void;
  /** Hanya satu tanggal (rekap harian). */
  single?: boolean;
}) {
  const options = single
    ? PERIOD_OPTIONS.filter((o) => ['today', 'yesterday', 'custom'].includes(o.key))
    : PERIOD_OPTIONS;
  return (
    <div className="space-y-2">
      <Chips
        options={options}
        value={value.key}
        onChange={(k) => {
          const key = k as PeriodKey;
          onChange(key === 'custom' ? { ...value, key } : { key, ...periodRange(key) });
        }}
      />
      {value.key === 'custom' && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label={single ? 'Tanggal' : 'Dari tanggal'}
            value={value.from}
            max={single ? dateKeyWita(0) : value.to}
            onChange={(e) =>
              e.target.value &&
              onChange({ ...value, from: e.target.value, to: single ? e.target.value : value.to })
            }
          />
          {!single && (
            <>
              <span className="text-sm text-stone-500">s/d</span>
              <Input
                type="date"
                aria-label="Sampai tanggal"
                value={value.to}
                min={value.from}
                max={dateKeyWita(0)}
                onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
