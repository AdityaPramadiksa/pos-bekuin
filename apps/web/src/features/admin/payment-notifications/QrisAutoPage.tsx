import {
  formatRupiah,
  PAYMENT_NOTIFICATION_RESULT_LABEL,
  type PaymentNotificationResult,
  type PaymentWebhookSetup,
} from '@bekuin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { SwitchRow } from '@/components/ui/switch';
import { isLocalOrigin } from '@/features/admin/tables/qr';
import { formatDateTime } from '@/features/orders/order-format';
import { isAutoPrintEnabled, setAutoPrintEnabled } from '@/features/printer/auto-print';
import { connectedPrinterName } from '@/features/printer/bluetooth';
import { api, apiAbsoluteUrl, errorMessage } from '@/lib/api';

const KEY = ['payment-notifications'];

// Isi body HTTP Request di MacroDroid. [not_title] & [notification] = Magic Text MacroDroid.
const BODY_TEMPLATE = '{"app":"DANA","title":"[not_title]","text":"[notification]"}';

const RESULT_TONE: Record<PaymentNotificationResult, 'green' | 'amber' | 'red' | 'neutral'> = {
  MATCHED: 'green',
  UNMATCHED: 'amber',
  AMBIGUOUS: 'amber',
  IGNORED: 'neutral',
  FAILED: 'red',
};

async function copy(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} disalin`);
  } catch {
    toast.error('Tidak bisa menyalin, salin manual ya');
  }
}

/**
 * QRIS otomatis: MacroDroid di HP admin meneruskan notifikasi DANA "uang masuk" ke server.
 * Nominal dicocokkan dengan order QRIS yang menunggu (total + kode unik) → langsung Diproses.
 */
export function QrisAutoPage() {
  const setup = useQuery({
    queryKey: KEY,
    queryFn: async () => (await api.get<PaymentWebhookSetup>('/payment-notifications/setup')).data,
  });
  return (
    <>
      <PageHeader
        title="QRIS Otomatis"
        subtitle="Order QRIS diproses begitu notifikasi DANA masuk"
      />
      <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
        {setup.isPending ? (
          <LoadingState rows={4} />
        ) : setup.isError ? (
          <ErrorState error={setup.error} onRetry={() => setup.refetch()} />
        ) : (
          <>
            <WebhookCard setup={setup.data} />
            <DeviceCard />
            <TestCard />
            <HistoryCard setup={setup.data} />
          </>
        )}
      </div>
    </>
  );
}

function WebhookCard({ setup }: { setup: PaymentWebhookSetup }) {
  const queryClient = useQueryClient();
  const url = apiAbsoluteUrl(setup.path);
  const rotate = useMutation({
    mutationFn: () => api.post('/payment-notifications/rotate-key'),
    onSuccess: () => {
      toast.success('URL baru dibuat. Perbarui URL di MacroDroid.');
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold">1. Pasang MacroDroid di HP admin (Android)</h2>
      {isLocalOrigin() && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Alamat ini <b>{window.location.origin}</b> hanya bisa diakses dari laptop ini. MacroDroid
          di HP butuh alamat internet: buka halaman ini lewat Cloudflare Tunnel atau domain toko.
        </p>
      )}
      <div>
        <p className="text-sm font-medium">URL webhook (rahasia, jangan dibagikan)</p>
        <div className="mt-1 flex items-center gap-2 rounded-xl bg-stone-50 p-2">
          <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
          <Button size="sm" variant="outline" onClick={() => copy(url, 'URL')}>
            <Copy className="size-4" /> Salin
          </Button>
        </div>
      </div>
      <div>
        <p className="text-sm font-medium">Isi body (JSON)</p>
        <div className="mt-1 flex items-center gap-2 rounded-xl bg-stone-50 p-2">
          <code className="min-w-0 flex-1 text-xs break-all">{BODY_TEMPLATE}</code>
          <Button size="sm" variant="outline" onClick={() => copy(BODY_TEMPLATE, 'Body')}>
            <Copy className="size-4" /> Salin
          </Button>
        </div>
      </div>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-stone-700">
        <li>
          Pasang aplikasi <b>MacroDroid</b> dari Play Store, beri izin akses notifikasi.
        </li>
        <li>
          Tambah macro → <b>Trigger</b>: <i>Notification Received</i> → pilih aplikasi <b>DANA</b>{' '}
          (dan DANA Bisnis bila dipakai).
        </li>
        <li>
          <b>Action</b>: <i>HTTP Request</i> → metode <b>POST</b>, URL di atas, content type{' '}
          <b>application/json</b>, body seperti di atas. Pilih <i>[not_title]</i> dan{' '}
          <i>[notification]</i> lewat tombol Magic Text (judul & isi notifikasi).
        </li>
        <li>Simpan macro. Matikan penghemat baterai untuk MacroDroid supaya tetap jalan.</li>
        <li>
          Uji: bayar QRIS kecil dari HP lain ke order percobaan. Hasilnya muncul di{' '}
          <b>Riwayat notifikasi</b> di bawah.
        </li>
      </ol>
      <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900">
        Hanya notifikasi <b>uang masuk</b> yang dipakai, dan nominalnya harus sama persis dengan
        total + kode unik salah satu order QRIS yang menunggu. Uang keluar, top up, atau nominal
        lain hanya dicatat. Bila tidak cocok, setujui manual di Approval seperti biasa.
      </p>
      <Button
        variant="ghost"
        size="sm"
        loading={rotate.isPending}
        onClick={() =>
          window.confirm('Buat URL baru? URL lama langsung tidak berlaku.') && rotate.mutate()
        }
      >
        <RefreshCw className="size-4" /> Ganti URL (bila bocor)
      </Button>
    </section>
  );
}

function DeviceCard() {
  const [autoPrint, setAutoPrint] = useState(isAutoPrintEnabled());
  const printer = connectedPrinterName();
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold">2. Cetak struk otomatis</h2>
      <SwitchRow
        title="Cetak struk QRIS otomatis di perangkat ini"
        description={
          printer
            ? `Printer terhubung: ${printer}`
            : 'Printer belum terhubung. Hubungkan di Lainnya → Printer dan biarkan aplikasi terbuka.'
        }
        checked={autoPrint}
        onChange={(v) => {
          setAutoPrint(v);
          setAutoPrintEnabled(v);
        }}
      />
      <p className="text-xs text-stone-500">
        Saat QRIS terdeteksi, semua HP/tablet admin yang membuka aplikasi berbunyi. Struk hanya
        tercetak di perangkat yang pilihan ini aktif dan printernya tersambung.
      </p>
    </section>
  );
}

interface TestResult {
  amount: number | null;
  incoming: boolean;
  ignoreReason: string | null;
  matches: { orderNo: string; customerName: string | null }[];
}

function TestCard() {
  const [text, setText] = useState('');
  const test = useMutation({
    mutationFn: async () =>
      (await api.post<TestResult>('/payment-notifications/test', { text })).data,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const r = test.data;
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold">3. Coba baca teks notifikasi</h2>
      <Field label="Tempel isi notifikasi DANA" hint="Hanya dicoba, tidak menyetujui order apa pun">
        <Textarea
          rows={2}
          value={text}
          maxLength={1000}
          placeholder="Kamu menerima Rp25.037 dari ..."
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <Button
        variant="outline"
        disabled={!text.trim()}
        loading={test.isPending}
        onClick={() => test.mutate()}
      >
        Coba baca
      </Button>
      {r && (
        <div className="rounded-xl bg-stone-50 p-3 text-sm">
          <p>
            Nominal: <b>{r.amount !== null ? formatRupiah(r.amount) : 'tidak terbaca'}</b>
          </p>
          {r.ignoreReason ? (
            <p className="text-amber-800">Diabaikan: {r.ignoreReason}</p>
          ) : r.matches.length === 0 ? (
            <p className="text-amber-800">
              Uang masuk, tapi tidak ada order QRIS menunggu dengan nominal ini.
            </p>
          ) : (
            <p className="text-green-800">
              Cocok dengan{' '}
              {r.matches
                .map((m) => `${m.orderNo}${m.customerName ? ` (${m.customerName})` : ''}`)
                .join(', ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function HistoryCard({ setup }: { setup: PaymentWebhookSetup }) {
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold">Riwayat notifikasi</h2>
      {setup.notifications.length === 0 ? (
        <EmptyState
          title="Belum ada notifikasi masuk"
          description="Setelah MacroDroid terpasang, setiap notifikasi DANA tercatat di sini."
        />
      ) : (
        <ul className="divide-y divide-stone-100">
          {setup.notifications.map((n) => (
            <li key={n.id} className="space-y-1 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={RESULT_TONE[n.result]}>
                  {PAYMENT_NOTIFICATION_RESULT_LABEL[n.result]}
                </Badge>
                {n.amount !== null && <b>{formatRupiah(n.amount)}</b>}
                {n.order && (
                  <span className="text-stone-600">
                    → {n.order.orderNo}
                    {n.order.customerName ? ` · ${n.order.customerName}` : ''}
                  </span>
                )}
                <span className="ml-auto text-xs text-stone-500">
                  {formatDateTime(n.receivedAt)}
                </span>
              </div>
              <p className="text-xs break-words text-stone-500">
                {[n.title, n.text].filter(Boolean).join(' · ')}
              </p>
              {n.message && <p className="text-xs text-stone-700">{n.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
