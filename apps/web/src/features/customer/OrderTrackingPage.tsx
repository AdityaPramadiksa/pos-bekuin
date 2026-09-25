import { useParams } from 'react-router-dom';

/** Lacak status pesanan pelanggan QR (Sprint 3): realtime via Socket.IO room order:<publicToken>. */
export function OrderTrackingPage() {
  const { publicToken } = useParams();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-xl font-bold">Status Pesanan</h1>
      <p className="text-sm text-stone-600">Halaman lacak pesanan hadir di Sprint 3.</p>
      <p className="font-mono text-xs text-stone-400">{publicToken}</p>
    </div>
  );
}
