import type { TableView } from '@bekuin/shared';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/states';
import { assetUrl } from '@/lib/api';
import { useSettings, useTables } from '@/lib/queries';
import { useQrImage } from './useQrImage';

/** Lembar A4 siap cetak: satu kartu per meja aktif. */
export function PrintQrPage() {
  const tables = useTables();
  const settings = useSettings();
  const active = (tables.data ?? []).filter((t) => t.isActive);

  return (
    <div className="min-h-dvh bg-white p-6 print:p-0">
      <div className="mb-4 flex items-center gap-3 print:hidden">
        <h1 className="text-lg font-bold">Cetak QR Meja ({active.length})</h1>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Cetak
        </Button>
        <p className="text-sm text-stone-500">
          Gunakan kertas A4, skala 100%. Potong lalu tempel/laminating.
        </p>
      </div>
      {tables.isPending ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-2 gap-4 print:gap-0">
          {active.map((t) => (
            <QrCard
              key={t.id}
              table={t}
              storeName={settings.data?.storeName ?? 'Bekuin'}
              logoUrl={settings.data?.logoUrl ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function QrCard({
  table,
  storeName,
  logoUrl,
}: {
  table: TableView;
  storeName: string;
  logoUrl: string | null;
}) {
  const qr = useQrImage(table.qrToken, 600);
  return (
    <div className="flex break-inside-avoid flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 p-6 text-center print:rounded-none print:border-stone-400">
      <div className="flex items-center gap-2">
        <img
          src={logoUrl ? assetUrl(logoUrl) : '/favicon.svg'}
          alt=""
          className="size-8 rounded-lg"
        />
        <span className="text-brand-700 text-xl font-bold">{storeName}</span>
      </div>
      <p className="text-sm font-semibold tracking-wide text-stone-600 uppercase">
        Scan untuk pesan
      </p>
      {qr.data && <img src={qr.data} alt={`QR ${table.name}`} className="size-56" />}
      <p className="text-3xl font-black">
        {table.code === 'TAKEAWAY' ? 'Bawa Pulang' : table.name}
      </p>
      <p className="text-xs text-stone-500">Pesan & bayar QRIS dari HP · tanpa antre</p>
    </div>
  );
}
