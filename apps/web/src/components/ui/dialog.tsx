import { X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/** Dialog: bottom sheet di HP, modal di tengah di tablet/desktop. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
      <div className="absolute inset-0 bg-stone-900/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl md:rounded-2xl',
          size === 'lg' ? 'md:max-w-2xl' : 'md:max-w-md',
        )}
      >
        <div className="flex items-start gap-3 border-b border-stone-100 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{title}</h2>
            {description && <p className="text-xs text-stone-500">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="-mr-1 rounded-lg p-1 text-stone-500 hover:bg-stone-100"
            aria-label="Tutup"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="pb-safe flex gap-2 border-t border-stone-100 px-4 py-3 [&>*]:flex-1">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
