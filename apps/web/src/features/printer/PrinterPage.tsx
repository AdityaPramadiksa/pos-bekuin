import { formatNumber } from '@bekuin/shared';
import { Bluetooth, BluetoothOff, Printer } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import {
  connectPrinter,
  connectedPrinterName,
  disconnectPrinter,
  isBluetoothSupported,
  printBytes,
} from './bluetooth';
import { EscPosBuilder } from './escpos';

function testReceipt() {
  return new EscPosBuilder()
    .align('center')
    .bold(true)
    .size('double')
    .line('BEKUIN')
    .size('normal')
    .bold(false)
    .line('Frozen Food - Siap Makan')
    .line('Tes printer: Halo Bekuin!')
    .align('left')
    .divider()
    .pair('Udang Keju 6pcs', '')
    .pair('  2 x 22.000', formatNumber(44000))
    .divider()
    .bold(true)
    .pair('TOTAL', formatNumber(44000))
    .bold(false)
    .divider()
    .align('center')
    .line('Printer siap dipakai')
    .feed(4)
    .build();
}

export function PrinterPage() {
  const [name, setName] = useState<string | null>(connectedPrinterName());
  const [busy, setBusy] = useState(false);
  const supported = isBluetoothSupported();
  const lastName = localStorage.getItem('bekuin-printer-name');

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      // User menutup dialog pilih perangkat = bukan error.
      if (error instanceof DOMException && error.name === 'NotFoundError') return;
      toast.error(error instanceof Error ? error.message : 'Gagal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Printer" subtitle="Thermal Bluetooth 58mm" />
      <div className="mx-auto max-w-xl space-y-4 p-4 md:p-6">
        {!supported && (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
            Browser ini tidak mendukung Web Bluetooth. Buka aplikasi lewat <b>Chrome di Android</b>{' '}
            dengan alamat HTTPS (atau localhost).
          </div>
        )}

        <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
          {name ? (
            <Bluetooth className="size-6 text-green-600" />
          ) : (
            <BluetoothOff className="size-6 text-stone-400" />
          )}
          <div className="flex-1">
            <p className="font-medium">{name ?? 'Belum terhubung'}</p>
            {!name && lastName && <p className="text-xs text-stone-500">Terakhir: {lastName}</p>}
          </div>
          {name ? (
            <button
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm"
              onClick={() => {
                disconnectPrinter();
                setName(null);
              }}
            >
              Putuskan
            </button>
          ) : (
            <button
              disabled={!supported || busy}
              className="bg-brand-700 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() => run(async () => setName(await connectPrinter()))}
            >
              Hubungkan
            </button>
          )}
        </div>

        <button
          disabled={!name || busy}
          onClick={() =>
            run(async () => {
              await printBytes(testReceipt());
              toast.success('Tes print terkirim');
            })
          }
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 py-3 font-semibold text-white disabled:opacity-40"
        >
          <Printer className="size-5" /> Tes Print "Halo Bekuin"
        </button>

        <p className="text-xs text-stone-500">
          Tips: nyalakan printer dan Bluetooth HP, jangan pair lewat pengaturan Android (cukup dari
          tombol Hubungkan). Bila printer tidak muncul atau gagal cetak, catat merek/tipenya untuk
          dicek dukungan BLE-nya.
        </p>
      </div>
    </>
  );
}
