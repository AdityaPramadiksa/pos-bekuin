import {
  formatRupiah,
  isWithinOpeningHours,
  type OpeningHours,
  type SettingsView,
  WEEKDAY_LABEL,
  WEEKDAYS,
} from '@bekuin/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ImageUpload } from '@/components/ImageUpload';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/input';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Switch, SwitchRow } from '@/components/ui/switch';
import { api, errorMessage } from '@/lib/api';
import { queryKeys, useSettings } from '@/lib/queries';

export function SettingsPage() {
  const settings = useSettings();
  return (
    <>
      <PageHeader title="Pengaturan Toko" subtitle="Info toko, struk, QRIS, jam buka, self-order" />
      {settings.isPending ? (
        <div className="mx-auto max-w-2xl p-4 md:p-6">
          <LoadingState />
        </div>
      ) : settings.isError ? (
        <div className="mx-auto max-w-2xl p-4 md:p-6">
          <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
        </div>
      ) : (
        <SettingsForm initial={settings.data} />
      )}
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="text-xs text-stone-500">{description}</p>}
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

const DEFAULT_RANGE: [string, string] = ['09:00', '21:00'];

function SettingsForm({ initial }: { initial: SettingsView }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const set = <K extends keyof SettingsView>(key: K, value: SettingsView[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const hours = form.openingHours;
  const hasSchedule = !!hours && Object.keys(hours).length > 0;
  const openNow = form.isStoreOpen && isWithinOpeningHours(hours);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        ...form,
        tagline: form.tagline?.trim() || null,
        address: form.address?.trim() || null,
        phone: form.phone?.trim() || null,
        receiptFooter: form.receiptFooter?.trim() || null,
      };
      return (await api.patch<SettingsView>('/settings', body)).data;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.settings, saved);
      setForm(saved);
      toast.success('Pengaturan disimpan');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function setDay(day: (typeof WEEKDAYS)[number], range: [string, string] | null) {
    set('openingHours', { ...(hours ?? {}), [day]: range } as OpeningHours);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-28 md:p-6 md:pb-28">
      <Section title="Info Toko" description="Tampil di struk dan menu pelanggan">
        <Field label="Logo">
          <ImageUpload purpose="logo" value={form.logoUrl} onChange={(v) => set('logoUrl', v)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nama toko">
            <Input
              value={form.storeName}
              maxLength={40}
              onChange={(e) => set('storeName', e.target.value)}
            />
          </Field>
          <Field label="Tagline">
            <Input
              value={form.tagline ?? ''}
              maxLength={60}
              onChange={(e) => set('tagline', e.target.value)}
            />
          </Field>
          <Field label="No. WhatsApp">
            <Input
              inputMode="tel"
              value={form.phone ?? ''}
              maxLength={20}
              onChange={(e) => set('phone', e.target.value)}
            />
          </Field>
          <Field label="Alamat">
            <Input
              value={form.address ?? ''}
              maxLength={200}
              onChange={(e) => set('address', e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Footer struk"
          hint="Baris penutup di bawah struk (boleh lebih dari satu baris)"
        >
          <Textarea
            value={form.receiptFooter ?? ''}
            maxLength={200}
            onChange={(e) => set('receiptFooter', e.target.value)}
          />
        </Field>
      </Section>

      <Section
        title="QRIS Toko"
        description="Gambar QRIS statis dari aplikasi merchant (GoPay/DANA/bank). Ditampilkan ke pelanggan saat bayar."
      >
        <ImageUpload
          purpose="qris"
          aspect="portrait"
          value={form.qrisImageUrl}
          onChange={(v) => set('qrisImageUrl', v)}
        />
        {!form.qrisImageUrl && (
          <p className="text-xs text-amber-700">
            Belum ada gambar QRIS — pembayaran QRIS belum bisa ditampilkan.
          </p>
        )}
      </Section>

      <Section title="Jam Operasional">
        <div className="flex items-center gap-2">
          <span className="text-sm">Status sekarang:</span>
          <Badge tone={openNow ? 'green' : 'red'}>{openNow ? 'Buka' : 'Tutup'}</Badge>
        </div>
        <SwitchRow
          title="Toko buka"
          description="Matikan untuk menutup sementara (libur, stok habis) tanpa mengubah jadwal"
          checked={form.isStoreOpen}
          onChange={(v) => set('isStoreOpen', v)}
        />
        <SwitchRow
          title="Pakai jadwal jam buka"
          description={
            hasSchedule
              ? 'Self-order QR hanya bisa dipakai pada jam buka (WITA)'
              : 'Tanpa jadwal = selalu buka selama "Toko buka" aktif'
          }
          checked={hasSchedule}
          onChange={(on) =>
            set(
              'openingHours',
              on ? Object.fromEntries(WEEKDAYS.map((d) => [d, DEFAULT_RANGE])) : null,
            )
          }
        />
        {hasSchedule && (
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
            {WEEKDAYS.map((day) => {
              const range = hours?.[day] ?? null;
              return (
                <li key={day} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="w-16 text-sm">{WEEKDAY_LABEL[day]}</span>
                  <Switch
                    checked={!!range}
                    onChange={(on) => setDay(day, on ? DEFAULT_RANGE : null)}
                    label={`Buka ${WEEKDAY_LABEL[day]}`}
                  />
                  {range ? (
                    // HP: jam turun ke baris sendiri; tablet ke atas: sebaris di kanan.
                    <div className="flex w-full items-center gap-1 sm:ml-auto sm:w-auto">
                      <Input
                        type="time"
                        aria-label={`Jam buka ${WEEKDAY_LABEL[day]}`}
                        className="flex-1 sm:w-32 sm:flex-none"
                        value={range[0]}
                        onChange={(e) => setDay(day, [e.target.value, range[1]])}
                      />
                      <span className="text-stone-400">–</span>
                      <Input
                        type="time"
                        aria-label={`Jam tutup ${WEEKDAY_LABEL[day]}`}
                        className="flex-1 sm:w-32 sm:flex-none"
                        value={range[1]}
                        onChange={(e) => setDay(day, [range[0], e.target.value])}
                      />
                    </div>
                  ) : (
                    <span className="ml-auto text-sm text-stone-400">Tutup</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        title="Self-Order QR Meja"
        description="Aturan untuk pelanggan yang pesan dengan scan QR"
      >
        <SwitchRow
          title="Self-order aktif"
          description="Matikan agar semua QR meja menampilkan 'pesan di kasir'"
          checked={form.qrOrderingEnabled}
          onChange={(v) => set('qrOrderingEnabled', v)}
        />
        <Field label="Cara bayar pelanggan QR">
          <Select
            value={form.qrPaymentMode}
            onChange={(e) => set('qrPaymentMode', e.target.value as SettingsView['qrPaymentMode'])}
          >
            <option value="QRIS_ONLY">Wajib bayar QRIS dari HP</option>
            <option value="QRIS_OR_CASHIER">QRIS atau bayar di kasir</option>
          </Select>
        </Field>
        <Field
          label="Batas total per order"
          hint={`Order QR di atas ${formatRupiah(form.qrMaxOrderTotal || 0)} ditolak (mencegah iseng)`}
        >
          <MoneyInput
            value={form.qrMaxOrderTotal}
            onChange={(v) => set('qrMaxOrderTotal', v === '' ? 0 : v)}
          />
        </Field>
      </Section>

      <Section title="Stok">
        <SwitchRow
          title="Blokir approve bila stok kurang"
          description="Disarankan aktif agar stok tidak pernah minus"
          checked={form.blockApproveOnLowStock}
          onChange={(v) => set('blockApproveOnLowStock', v)}
        />
      </Section>

      <div className="pb-safe fixed inset-x-0 bottom-16 z-10 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-56">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Button variant="outline" disabled={!dirty} onClick={() => setForm(initial)}>
            Batalkan
          </Button>
          <Button
            className="flex-1"
            disabled={!dirty || form.qrMaxOrderTotal < 10_000}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {dirty ? 'Simpan perubahan' : 'Tersimpan'}
          </Button>
        </div>
      </div>
    </div>
  );
}
