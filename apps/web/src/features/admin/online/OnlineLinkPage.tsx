import { formatRupiah, type SettingsView } from '@bekuin/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, MessageCircle, RefreshCw, Share2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Field, Input, MoneyInput } from '@/components/ui/input';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { SwitchRow } from '@/components/ui/switch';
import { isLocalOrigin, onlineOrderUrl, qrDataUrl } from '@/features/admin/tables/qr';
import { api, errorMessage } from '@/lib/api';
import { queryKeys, useSettings } from '@/lib/queries';

export function OnlineLinkPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader
        title="Link Order Online"
        subtitle="Bagikan ke WhatsApp & Instagram, pelanggan pesan sendiri"
      />
      <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
        {settings.isPending ? (
          <LoadingState rows={4} />
        ) : settings.isError ? (
          <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
        ) : (
          <>
            <ShareCard settings={settings.data} />
            <DeliverySettings key={settings.data.onlineOrderToken} initial={settings.data} />
          </>
        )}
      </div>
    </>
  );
}

function ShareCard({ settings }: { settings: SettingsView }) {
  const queryClient = useQueryClient();
  const url = settings.onlineOrderToken ? onlineOrderUrl(settings.onlineOrderToken) : '';
  const message = `Halo! Pesan ${settings.storeName} bisa langsung lewat link ini ya, pilih menu, tanggal, dan cara bayar sendiri:\n${url}`;
  const qr = useQuery({
    queryKey: ['online-qr', url],
    queryFn: () => qrDataUrl(url, 720),
    enabled: !!url,
    staleTime: Infinity,
  });
  const rotate = useMutation({
    mutationFn: () => api.post('/settings/online-link/rotate'),
    onSuccess: () => {
      toast.success('Link baru dibuat. Link lama tidak berlaku lagi.');
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} disalin`);
    } catch {
      toast.error('Tidak bisa menyalin, salin manual ya');
    }
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: settings.storeName, text: message }).catch(() => undefined);
    } else {
      await copy(message, 'Pesan');
    }
  }

  return (
    <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
      {isLocalOrigin() && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Link sekarang memakai <b>{window.location.origin}</b> yang hanya bisa dibuka di laptop
          ini. Untuk dicoba dari HP, buka halaman ini lewat alamat Cloudflare Tunnel. Untuk dipakai
          sungguhan, isi <code>VITE_PUBLIC_WEB_URL</code> dengan domain toko.
        </p>
      )}
      <div>
        <p className="text-sm font-medium">Link pesan</p>
        <div className="mt-1 flex items-center gap-2 rounded-xl bg-stone-50 p-2">
          <code className="min-w-0 flex-1 truncate text-sm">{url}</code>
          <Button size="sm" variant="outline" onClick={() => copy(url, 'Link')}>
            <Copy className="size-4" /> Salin
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-green-600 px-3 py-2.5 text-sm font-semibold text-white"
        >
          <MessageCircle className="size-4" /> Kirim ke WhatsApp
        </a>
        <Button variant="outline" onClick={share}>
          <Share2 className="size-4" /> Bagikan
        </Button>
      </div>

      <div className="flex flex-col items-center gap-2 border-t border-stone-100 pt-4">
        <p className="text-sm text-stone-600">QR untuk story, katalog, atau kemasan</p>
        {qr.data ? (
          <>
            <img
              src={qr.data}
              alt="QR link order online"
              className="w-56 rounded-xl border border-stone-200"
            />
            <a
              href={qr.data}
              download="qr-order-online.png"
              className="text-brand-700 inline-flex items-center gap-1 text-sm font-medium"
            >
              <Download className="size-4" /> Unduh QR
            </a>
          </>
        ) : (
          <LoadingState rows={2} />
        )}
      </div>

      <div className="border-t border-stone-100 pt-3">
        <Button
          variant="ghost"
          size="sm"
          loading={rotate.isPending}
          onClick={() =>
            window.confirm(
              'Buat link baru? Link & QR lama langsung tidak berlaku (pesanan yang sudah masuk tetap aman).',
            ) && rotate.mutate()
          }
        >
          <RefreshCw className="size-4" /> Ganti link (bila disalahgunakan)
        </Button>
      </div>
    </section>
  );
}

function DeliverySettings({ initial }: { initial: SettingsView }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    onlineOrderingEnabled: initial.onlineOrderingEnabled,
    deliveryEnabled: initial.deliveryEnabled,
    deliveryFee: initial.deliveryFee as number | '',
    freeDeliveryMin: (initial.freeDeliveryMin || '') as number | '',
    deliveryNote: initial.deliveryNote ?? '',
  });
  const save = useMutation({
    mutationFn: () =>
      api.patch('/settings', {
        onlineOrderingEnabled: form.onlineOrderingEnabled,
        deliveryEnabled: form.deliveryEnabled,
        deliveryFee: form.deliveryFee || 0,
        freeDeliveryMin: form.freeDeliveryMin || 0,
        deliveryNote: form.deliveryNote.trim() || null,
      }),
    onSuccess: () => {
      toast.success('Pengaturan order online disimpan');
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold">Pengaturan order online</h2>
      <SwitchRow
        title="Terima order online"
        description="Matikan sementara bila sedang libur atau stok habis"
        checked={form.onlineOrderingEnabled}
        onChange={(onlineOrderingEnabled) => setForm({ ...form, onlineOrderingEnabled })}
      />
      <SwitchRow
        title="Layanan antar"
        description="Bila mati, pelanggan hanya bisa ambil sendiri"
        checked={form.deliveryEnabled}
        onChange={(deliveryEnabled) => setForm({ ...form, deliveryEnabled })}
      />
      {form.deliveryEnabled && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ongkir">
              <MoneyInput
                value={form.deliveryFee}
                onChange={(deliveryFee) => setForm({ ...form, deliveryFee })}
              />
            </Field>
            <Field
              label="Gratis ongkir mulai"
              hint={
                form.freeDeliveryMin
                  ? `Subtotal ≥ ${formatRupiah(form.freeDeliveryMin)}`
                  : 'Kosongkan bila tidak ada'
              }
            >
              <MoneyInput
                value={form.freeDeliveryMin}
                onChange={(freeDeliveryMin) => setForm({ ...form, freeDeliveryMin })}
              />
            </Field>
          </div>
          <Field label="Info area antar (opsional)">
            <Input
              value={form.deliveryNote}
              maxLength={150}
              placeholder="Antar area Denpasar, jam 10.00–17.00"
              onChange={(e) => setForm({ ...form, deliveryNote: e.target.value })}
            />
          </Field>
        </>
      )}
      <p className="text-xs text-stone-500">
        Alamat ambil sendiri memakai alamat toko di Pengaturan. Cara bayar (QRIS, Cash/COD) diatur
        di Metode Bayar. Pesanan online bisa untuk hari ini (saat toko buka) sampai 14 hari ke
        depan.
      </p>
      <Button className="w-full" loading={save.isPending} onClick={() => save.mutate()}>
        Simpan
      </Button>
    </section>
  );
}
