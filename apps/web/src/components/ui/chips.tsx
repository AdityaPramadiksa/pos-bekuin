import { cn } from '@/lib/utils';

export function Chips({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string; count?: number }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap',
            value === o.key
              ? 'border-brand-700 bg-brand-700 text-white'
              : 'border-stone-300 bg-white text-stone-600',
          )}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && (
            <span className="ml-1 font-semibold">({o.count})</span>
          )}
        </button>
      ))}
    </div>
  );
}
