import { connection } from '@/lib/connection';
import { useDashboard } from '@/store/store';

export function LoadingState() {
  return (
    <div className="grid flex-1 place-items-center" role="status">
      <div className="flex flex-col items-center gap-3 text-muted">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
        Memuat run…
      </div>
    </div>
  );
}

export function EmptyState() {
  const setNewRunOpen = useDashboard((s) => s.setNewRunOpen);
  return (
    <div className="panel grid flex-1 place-items-center p-8 text-center">
      <div className="max-w-md">
        <div className="text-5xl" aria-hidden>
          🏢
        </div>
        <h2 className="mt-3 text-xl font-bold">Kantor masih kosong</h2>
        <p className="mt-2 text-sm text-muted">
          Belum ada run. Mulai run pertama untuk menjalankan beberapa agent Claude Code dan memantau
          aktivitasnya di sini.
        </p>
        <button
          type="button"
          onClick={() => setNewRunOpen(true)}
          className="mt-5 rounded-full bg-gradient-to-r from-accent to-accent-2 px-5 py-2 font-semibold text-white"
        >
          + Mulai run
        </button>
      </div>
    </div>
  );
}

export function ErrorState() {
  const error = useDashboard((s) => s.error);
  return (
    <div className="panel grid flex-1 place-items-center p-8 text-center" role="alert">
      <div className="max-w-md">
        <div className="text-5xl" aria-hidden>
          ⚠️
        </div>
        <h2 className="mt-3 text-xl font-bold">Gagal memuat dashboard</h2>
        <p className="mt-2 text-sm text-muted">{error}</p>
        <button
          type="button"
          onClick={() => connection.retry()}
          className="mt-5 rounded-full border border-line px-5 py-2 font-semibold hover:bg-panel-2"
        >
          Coba lagi
        </button>
      </div>
    </div>
  );
}

export function ReconnectBanner() {
  const state = useDashboard((s) => s.connection);
  const phase = useDashboard((s) => s.phase);
  if (state !== 'reconnecting' || phase !== 'ready') return null;
  return (
    <div
      role="status"
      className="rounded-xl border border-warn/50 bg-warn/10 px-4 py-2 text-sm text-amber-200"
    >
      Koneksi realtime terputus — menyambung ulang… Data yang tampil mungkin tertinggal.
    </div>
  );
}
