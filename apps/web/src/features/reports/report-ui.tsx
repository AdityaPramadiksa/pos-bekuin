import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl bg-white p-4 shadow-sm', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Kartu angka: label, nilai (angka proporsional), keterangan. */
export function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-sm">
      <p className="text-xs text-stone-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-bold',
          tone === 'good' && 'text-green-700',
          tone === 'bad' && 'text-red-600',
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-stone-500">{sub}</p>}
    </div>
  );
}

export function StatementRow({
  label,
  value,
  strong,
  sub,
}: {
  label: string;
  value: string;
  strong?: boolean;
  sub?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 py-2 text-sm',
        strong && 'border-t border-stone-200 font-semibold',
      )}
    >
      <span className={strong ? '' : 'text-stone-600'}>
        {label}
        {sub && <span className="ml-1 text-xs font-normal text-stone-500">{sub}</span>}
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
