import { AlertTriangle, Inbox, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '@/lib/api';
import { Button } from './button';

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Memuat">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-stone-200/70" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
      <Inbox className="size-8 text-stone-400" />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-xs text-sm text-stone-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-red-50 px-6 py-8 text-center">
      <AlertTriangle className="size-8 text-red-500" />
      <p className="text-sm text-red-700">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw className="size-4" /> Coba lagi
        </Button>
      )}
    </div>
  );
}
