import { formatRupiah, type PublicOrderView } from '@bekuin/shared';
import { ArrowLeftRight, Banknote, CheckCircle2, Copy, ImageUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { QrisCode } from '@/components/QrisCode';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/features/orders/order-format';
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
  changingMethod,
  onChangeMethod,
}: {
  order: PublicOrderView;
  uploading: boolean;
  onUpload: (file: File) => void;
  changingMethod: boolean;
  onChangeMethod: (paymentMethodId: string) => void;
}) {
  const p = o.payment;
  const switcher = <MethodSwitcher order={o} changing={changingMethod} onChange={onChangeMethod} />;

  if (p.type === 'CASH') {
    return (
      <section className="space-y-2 rounded-2xl bg-white p-4 text-center shadow-sm">
        {switcher}
        <Banknote className="text-brand-700 mx-auto size-8" />
        <p className="text-sm text-stone-600">
          {o.delivery
            ? o.delivery.method === 'DELIVERY'
              ? 'Bayar tunai ke kurir saat pesanan sampai (COD)'
              : 'Bayar tunai saat ambil pesanan'
            : 'Bayar tunai ke kasir'}
        </p>
        <p className="text-brand-700 text-3xl font-bold">{formatRupiah(p.amount)}</p>
        <p className="text-sm text-stone-600">
          {o.delivery ? (
            'Siapkan uang pas ya. Tidak perlu unggah bukti bayar, tunggu konfirmasi toko.'
          ) : (
            <>
              Sebutkan nomor pesanan <b>{o.orderNo}</b>. Pesanan diproses setelah pembayaran
              diterima.
            </>
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 text-center shadow-sm">
      {switcher}
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
        <div className="space-y-2 text-left text-sm">
          <p className="text-center text-stone-600">Transfer ke salah satu rekening berikut:</p>
          {p.bankAccounts.length > 0 ? (
            p.bankAccounts.map((b) => (
              <div
                key={`${b.bankName}-${b.accountNumber}`}
                className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 p-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-stone-500 uppercase">{b.bankName}</p>
                  <p className="text-lg font-bold tracking-wide tabular-nums">{b.accountNumber}</p>
                  <p className="text-xs text-stone-600">a.n. {b.accountName}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => copy(b.accountNumber)}>
                  <Copy className="size-4" /> Salin
                </Button>
              </div>
            ))
          ) : p.accountInfo ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 p-3">
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
            <p className="rounded-xl bg-stone-50 p-3 text-stone-600">
              Tanyakan nomor rekening ke toko.
            </p>
          )}
        </div>
      )}

      {o.canUploadProof && <ProofUpload order={o} uploading={uploading} onUpload={onUpload} />}
    </section>
  );
}

/** Cara bayar yang dipilih + tombol ganti (selama pesanan menunggu & belum kirim bukti bayar). */
function MethodSwitcher({
  order: o,
  changing,
  onChange,
}: {
  order: PublicOrderView;
  changing: boolean;
  onChange: (paymentMethodId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const others = o.paymentOptions.filter((m) => m.name !== o.payment.methodName);
  return (
    <div className="rounded-xl border border-stone-200 p-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs text-stone-500">Cara bayar</p>
          <p className="font-semibold">{o.payment.methodName ?? '-'}</p>
        </div>
        {others.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setOpen(!open)}>
            <ArrowLeftRight className="size-4" /> Ganti
          </Button>
        )}
      </div>
      {open && others.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
          <p className="text-xs text-stone-500">Ganti ke:</p>
          <div className="grid grid-cols-2 gap-2">
            {others.map((m) => (
              <Button
                key={m.id}
                variant="outline"
                loading={changing}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
              >
                {m.type === 'CASH' ? `${m.name} (bayar saat terima)` : m.name}
              </Button>
            ))}
          </div>
          <p className="text-xs text-stone-500">
            Belum bayar? Ganti dulu sebelum membayar. Setelah bukti bayar dikirim, cara bayar tidak
            bisa diganti lagi.
          </p>
        </div>
      )}
    </div>
  );
}

/** QRIS/Transfer: pelanggan wajib mengunggah bukti bayar; admin mengeceknya sebelum memproses. */
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
  return (
    <div className="space-y-2 border-t border-stone-100 pt-3">
      {o.hasPaymentProof ? (
        <p className="flex items-center justify-center gap-1 text-sm text-green-700">
          <CheckCircle2 className="size-4" /> Bukti bayar terkirim. Admin sedang mengecek.
        </p>
      ) : (
        <p className="rounded-xl bg-amber-50 p-3 text-left text-sm text-amber-900">
          <b>Wajib:</b> setelah bayar, unggah screenshot bukti bayar. Pesanan baru diproses setelah
          admin mengecek uangnya masuk.
          {o.payDeadline && (
            <span className="mt-1 block font-semibold">
              Batas unggah: {formatDateTime(o.payDeadline)}. Lewat dari itu pesanan otomatis
              dibatalkan.
            </span>
          )}
        </p>
      )}
      <Button
        variant={o.hasPaymentProof ? 'outline' : 'primary'}
        className="w-full"
        loading={uploading}
        onClick={() => input.current?.click()}
      >
        <ImageUp className="size-4" />{' '}
        {o.hasPaymentProof ? 'Ganti bukti bayar' : 'Unggah bukti bayar'}
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
    </div>
  );
}
