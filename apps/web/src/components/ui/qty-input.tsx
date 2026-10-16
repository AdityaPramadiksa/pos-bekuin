import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Angka jumlah di antara tombol − dan +. Bisa diketuk lalu diketik langsung (mis. 100) tanpa
 * menekan + berkali-kali. Disimpan saat keyboard ditutup / Enter. 0 atau kosong = hapus item.
 * Angka di atas `max` dibatasi ke `max` dan `onClamp` dipanggil supaya pengguna diberi tahu.
 */
export function QtyInput({
  value,
  max,
  onChange,
  onClamp,
  label,
  className,
}: {
  value: number;
  max: number;
  onChange: (qty: number) => void;
  onClamp?: (max: number) => void;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  const commit = () => {
    if (draft === null) return;
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    const typed = Number(draft || '0');
    setDraft(null);
    const qty = Math.min(Math.max(0, typed), max);
    if (typed > max) onClamp?.(max);
    if (qty !== value) onChange(qty);
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      enterKeyHint="done"
      aria-label={`Jumlah ${label}`}
      value={draft ?? String(value)}
      onFocus={(e) => {
        setDraft(String(value));
        // Pilih semua supaya ketikan langsung menggantikan angka lama.
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, '').slice(0, 4))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className={cn(
        'focus:border-brand-600 focus:ring-brand-600/20 h-8 w-11 rounded-lg border border-transparent bg-stone-50 text-center text-sm font-semibold tabular-nums outline-none focus:bg-white focus:ring-2',
        className,
      )}
    />
  );
}
