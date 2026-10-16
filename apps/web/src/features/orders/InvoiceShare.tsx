import type { OrderView, SettingsView } from '@bekuin/shared';
import { useMutation } from '@tanstack/react-query';
import { Download, Eye, EyeOff, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  downloadBlob,
  invoiceFileName,
  invoiceKind,
  renderInvoicePng,
  shareInvoice,
} from './invoice-image';

/** Kirim / unduh nota gambar untuk pelanggan (admin). */
export function InvoiceShare({ order, store }: { order: OrderView; store: SettingsView }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const label = invoiceKind(order) === 'NOTA' ? 'nota' : 'tagihan';

  // Pratinjau dibuat saat dibuka & ikut diperbarui bila order berubah (mis. baru dibayar).
  useEffect(() => {
    if (!open) return;
    let url: string | null = null;
    let alive = true;
    void renderInvoicePng(order, store).then((blob) => {
      if (!alive) return;
      url = URL.createObjectURL(blob);
      setPreview(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
      setPreview(null);
    };
  }, [open, order, store]);

  const share = useMutation({
    mutationFn: () => shareInvoice(order, store),
    onSuccess: (result) => {
      if (result === 'whatsapp')
        toast.success(
          `Gambar ${label} sudah diunduh. Di WhatsApp, tekan 📎 lalu pilih foto ${label} dari galeri.`,
          { duration: 8000 },
        );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : `Gagal membuat ${label}`),
  });
  const download = useMutation({
    mutationFn: async () =>
      downloadBlob(await renderInvoicePng(order, store), invoiceFileName(order)),
    onSuccess: () => toast.success(`Gambar ${label} diunduh`),
    onError: (e) => toast.error(e instanceof Error ? e.message : `Gagal membuat ${label}`),
  });

  return (
    <section className="space-y-2 rounded-xl bg-stone-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {label === 'nota' ? 'Nota pelanggan' : 'Tagihan pelanggan'}
        </p>
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-medium text-stone-600"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {open ? 'Sembunyikan' : 'Lihat'}
        </button>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" loading={share.isPending} onClick={() => share.mutate()}>
          <Send className="size-4" /> Kirim ke WA
        </Button>
        <Button variant="outline" loading={download.isPending} onClick={() => download.mutate()}>
          <Download className="size-4" /> Unduh
        </Button>
      </div>
      {open &&
        (preview ? (
          <img
            src={preview}
            alt={`Pratinjau ${label} ${order.orderNo}`}
            className="mx-auto w-full max-w-sm rounded-lg border border-stone-200"
          />
        ) : (
          <div className="h-40 animate-pulse rounded-lg bg-stone-200" />
        ))}
    </section>
  );
}
