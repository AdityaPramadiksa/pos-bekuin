import { formatRupiah, type PublicOrderView } from '@bekuin/shared';
import { Banknote, CheckCircle2, Copy, ImageUp } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { QrisCode } from '@/components/QrisCode';
import { Button } from '@/components/ui/button';
import { assetUrl } from '@/lib/api';

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Disalin');
  } catch {
    toast.error('Tidak bisa menyalin, catat manual ya');
  }
}

/** Instruksi bayar untuk pesanan PENDING sesuai cara bayar pilihan pelanggan. */
export function PaymentPanel({
  order: o,
  uploading,
  onUpload,
}: {
  order: PublicOrderView;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const p = o.payment;

  if (p.type === 'CASH') {
    return (
      <section className="space-y-2 rounded-2xl bg-white p-4 text-center shadow-sm">
        <Banknote className="text-brand-700 mx-auto size-8" />
        <p className="text-sm text-stone-600">Bayar tunai ke kasir</p>
        <p className="text-brand-700 text-3xl font-bold">{formatRupiah(p.amount)}</p>
        <p className="text-sm text-stone-600">
          Sebutkan nomor pesanan <b>{o.orderNo}</b>. Pesanan diproses setelah pembayaran diterima.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 text-center shadow-sm">
      <p className="text-sm text-stone-600">Bayar tepat</p>
      <div className="flex items-center justify-center gap-2">
        <p className="text-brand-700 text-3xl font-bold">{formatRupiah(p.amount)}</p>
        <button
          aria-label="Salin nominal"
          className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
          onClick={() => copy(String(p.amount))}
        >
          <Copy className="size-4" />
        </button>
      </div>
      {p.uniqueCode ? (
        <p className="text-xs text-stone-500">
          {formatRupiah(o.total)} + kode unik {formatRupiah(p.uniqueCode)} agar pembayaranmu
          langsung dikenali kasir.
        </p>
      ) : null}

      {p.type === 'QRIS' &&
        (p.qrisPayload ? (
          <>
            <QrisCode payload={p.qrisPayload} filename={`qris-${o.orderNo}`} />
            <ol className="list-decimal space-y-1 pl-5 text-left text-sm text-stone-600">
              <li>Buka DANA / GoPay / OVO / ShopeePay / m-banking, pilih Bayar atau Scan.</li>
              <li>
                Scan QR di atas. Kalau memakai HP ini, simpan QR ke galeri dulu lalu pilih gambar
                dari galeri di aplikasi pembayaran.
              </li>
              <li>
                Nominal <b>{formatRupiah(p.amount)}</b> sudah terisi otomatis, tinggal konfirmasi.
              </li>
            </ol>
          </>
        ) : o.store.qrisImageUrl ? (
          <>
            <img
              src={assetUrl(o.store.qrisImageUrl)}
              alt="QRIS toko"
              className="mx-auto w-full max-w-72 rounded-xl border"
            />
            <ol className="list-decimal space-y-1 pl-5 text-left text-sm text-stone-600">
              <li>Buka aplikasi pembayaran, pilih Bayar/Scan QRIS, lalu scan QR di atas.</li>
              <li>
                Ketik nominal tepat <b>{formatRupiah(p.amount)}</b>, lalu bayar.
              </li>
            </ol>
          </>
        ) : (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            QRIS belum tersedia. Silakan bayar di kasir dengan menyebut nomor pesanan.
          </p>
        ))}

      {p.type === 'TRANSFER' && (
        <div className="rounded-xl bg-stone-50 p-3 text-left text-sm">
          <p className="font-semibold">{p.methodName}</p>
          {p.accountInfo ? (
            <div className="flex items-center justify-between gap-2">
              <span>{p.accountInfo}</span>
              <button
                aria-label="Salin nomor rekening"
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100"
                onClick={() => copy(p.accountInfo!)}
              >
                <Copy className="size-4" />
              </button>
            </div>
          ) : (
            <p className="text-stone-600">Tanyakan nomor rekening ke kasir.</p>
          )}
        </div>
      )}

      <p className="text-xs text-stone-500">
        {p.type === 'QRIS'
          ? 'Bayar sesuai nominal (termasuk kode unik) supaya pesanan langsung diproses otomatis begitu uang masuk. Status di halaman ini berubah sendiri.'
          : 'Setelah pembayaran masuk, kasir mengonfirmasi dan status di halaman ini berubah otomatis.'}
      </p>

      {o.canUploadProof && <ProofUpload order={o} uploading={uploading} onUpload={onUpload} />}
    </section>
  );
}

/** Bukti bayar hanya perlu bila sudah bayar tapi belum dikonfirmasi. */
function ProofUpload({
  order: o,
  uploading,
  onUpload,
}: {
  order: PublicOrderView;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const button = (
    <>
      <Button
        variant="outline"
        className="w-full"
        loading={uploading}
        onClick={() => input.current?.click()}
      >
        <ImageUp className="size-4" />{' '}
        {o.hasPaymentProof ? 'Kirim ulang bukti bayar' : 'Kirim bukti bayar'}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = '';
        }}
      />
    </>
  );
  if (o.hasPaymentProof) {
    return (
      <div className="space-y-2 border-t border-stone-100 pt-3">
        <p className="flex items-center justify-center gap-1 text-sm text-green-700">
          <CheckCircle2 className="size-4" /> Bukti bayar terkirim
        </p>
        {button}
      </div>
    );
  }
  return (
    <details className="border-t border-stone-100 pt-3 text-left">
      <summary className="cursor-pointer text-center text-sm font-medium text-stone-600">
        Sudah bayar tapi belum dikonfirmasi?
      </summary>
      <p className="my-2 text-sm text-stone-600">
        Kirim screenshot bukti bayar supaya kasir bisa mengecek.
      </p>
      {button}
    </details>
  );
}
