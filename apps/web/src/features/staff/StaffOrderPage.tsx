import { useState } from 'react';
import { toast } from 'sonner';
import { PosScreen } from '@/features/pos/PosScreen';
import { PasteImport } from '@/features/preorder/PasteImport';
import { cn } from '@/lib/utils';

/** Order Baru staff: mode Cepat (stepper) atau Tempel Pesan WhatsApp. */
export function StaffOrderPage() {
  const [mode, setMode] = useState<'quick' | 'paste'>('quick');
  return (
    <>
      <ModeToggle mode={mode} onChange={setMode} />
      {mode === 'quick' ? (
        <PosScreen
          onSubmitted={(order) =>
            toast.success(`Order ${order.orderNo} terkirim ke admin`, {
              description: order.customerName ?? undefined,
            })
          }
        />
      ) : (
        <PasteImport onSaved={() => setMode('quick')} />
      )}
    </>
  );
}

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: 'quick' | 'paste';
  onChange: (m: 'quick' | 'paste') => void;
}) {
  return (
    <div className="flex gap-1 border-b border-stone-200 bg-white px-4 py-2">
      {(
        [
          { key: 'quick', label: 'Cepat' },
          { key: 'paste', label: 'Tempel Pesan WA' },
        ] as const
      ).map((m) => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-semibold',
            mode === m.key ? 'bg-stone-900 text-white' : 'text-stone-600',
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
