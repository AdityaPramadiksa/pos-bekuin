import type { OrderView, SettingsView } from '@bekuin/shared';
import { linesToText, receiptLines } from './receipt';

/** Pratinjau struk 58mm (monospace 32 kolom). */
export function ReceiptPreview({ order, store }: { order: OrderView; store: SettingsView }) {
  return (
    <pre className="mx-auto w-fit rounded-lg bg-white px-3 py-4 font-mono text-[11px] leading-snug text-stone-800 shadow-inner ring-1 ring-stone-200">
      {linesToText(receiptLines(order, store))}
    </pre>
  );
}
