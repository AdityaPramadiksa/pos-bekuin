import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import QRCode from 'qrcode';
import { LoadingState } from '@/components/ui/states';

/** Gambar QR dari teks QRIS (bernominal). Hitam pekat & margin cukup agar mudah di-scan. */
export function QrisCode({
  payload,
  filename,
  size = 280,
}: {
  payload: string;
  /** Nama file saat disimpan ke galeri (tanpa ekstensi). */
  filename: string;
  size?: number;
}) {
  const image = useQuery({
    queryKey: ['qris-image', payload],
    queryFn: () =>
      QRCode.toDataURL(payload, {
        width: 640,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      }),
    staleTime: Infinity,
  });
  if (image.isPending) return <LoadingState rows={2} />;
  if (image.isError) return <p className="text-sm text-red-600">QR gagal dibuat.</p>;
  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src={image.data}
        alt="QRIS pembayaran"
        width={size}
        height={size}
        className="rounded-xl border border-stone-200 bg-white"
        style={{ width: size, maxWidth: '100%', height: 'auto' }}
      />
      <a
        href={image.data}
        download={`${filename}.png`}
        className="text-brand-700 inline-flex items-center gap-1 text-sm font-medium"
      >
        <Download className="size-4" /> Simpan QR ke galeri
      </a>
    </div>
  );
}
