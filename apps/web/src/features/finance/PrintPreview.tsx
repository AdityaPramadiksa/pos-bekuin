import { Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { printBytes } from '@/features/printer/bluetooth';
import {
  isPrinterConnected,
  linesToEscPos,
  linesToText,
  type ReceiptLine,
} from '@/features/printer/receipt';

/** Pratinjau 58mm + tombol cetak ke printer Bluetooth. */
export function PrintPreview({ lines, label = 'Cetak' }: { lines: ReceiptLine[]; label?: string }) {
  const [printing, setPrinting] = useState(false);
  async function print() {
    if (!isPrinterConnected()) {
      toast.error('Printer belum terhubung. Buka Lainnya → Printer.');
      return;
    }
    setPrinting(true);
    try {
      await printBytes(linesToEscPos(lines));
      toast.success('Dicetak');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPrinting(false);
    }
  }
  return (
    <div className="space-y-2">
      <pre className="mx-auto w-fit max-w-full overflow-x-auto rounded-lg bg-white px-3 py-4 font-mono text-[11px] leading-snug text-stone-800 ring-1 ring-stone-200">
        {linesToText(lines)}
      </pre>
      <Button variant="outline" className="w-full" loading={printing} onClick={print}>
        <Printer className="size-4" /> {label}
      </Button>
    </div>
  );
}
