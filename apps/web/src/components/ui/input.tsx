import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

const base =
  'w-full rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none transition-colors placeholder:text-stone-400 focus:border-brand-600 disabled:bg-stone-100 disabled:text-stone-500';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(base, 'h-10', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(base, 'min-h-20 py-2', className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(base, 'h-10', className)} {...props} />;
}

/** Label + kontrol + teks bantuan/error. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block text-sm', className)}>
      <span className="mb-1 block font-medium text-stone-800">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>
      )}
    </label>
  );
}

/** Input rupiah: hanya angka, tampil dengan pemisah ribuan. */
export function MoneyInput({
  value,
  onChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | '';
  onChange: (value: number | '') => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-stone-500">
        Rp
      </span>
      <Input
        inputMode="numeric"
        className={cn('pl-9', className)}
        value={value === '' ? '' : value.toLocaleString('id-ID')}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '');
          onChange(digits === '' ? '' : Math.min(Number(digits), 100_000_000));
        }}
        {...props}
      />
    </div>
  );
}
