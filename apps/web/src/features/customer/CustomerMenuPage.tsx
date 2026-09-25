import { QrCode } from 'lucide-react';
import { useParams } from 'react-router-dom';

/**
 * Halaman pelanggan setelah scan QR meja (tanpa login).
 * Sprint 3: GET /public/tables/:qrToken/menu → daftar menu, keranjang, checkout, bayar QRIS.
 */
export function CustomerMenuPage() {
  const { qrToken } = useParams();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <QrCode className="text-brand-700 size-12" />
      <h1 className="text-xl font-bold">Selamat datang di Bekuin</h1>
      <p className="text-sm text-stone-600">
        Menu self-order untuk meja ini sedang disiapkan (Sprint 3). Silakan pesan di kasir dulu ya.
      </p>
      <p className="font-mono text-xs text-stone-400">QR: {qrToken}</p>
    </div>
  );
}
