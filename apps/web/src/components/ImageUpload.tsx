import type { UploadPurpose } from '@bekuin/shared';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, assetUrl, errorMessage } from '@/lib/api';
import { compressImage } from '@/lib/image';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';

/**
 * Pilih foto → kompres (kecuali QRIS, supaya QR tetap tajam) → upload → balikan URL.
 */
export function ImageUpload({
  value,
  onChange,
  purpose,
  aspect = 'square',
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  purpose: Exclude<UploadPurpose, 'proof'>;
  aspect?: 'square' | 'portrait';
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const keepOriginal = purpose === 'qris' && file.size <= 2 * 1024 * 1024;
      const blob = keepOriginal ? file : await compressImage(file);
      const form = new FormData();
      form.append('file', blob, keepOriginal ? file.name : 'foto.webp');
      const { data } = await api.post<{ url: string }>(`/uploads?purpose=${purpose}`, form);
      onChange(data.url);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-stone-300 bg-stone-50 text-stone-400',
          aspect === 'square' ? 'size-24' : 'h-32 w-24',
        )}
      >
        {value ? (
          <img src={assetUrl(value)} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-7" />
        )}
      </button>
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          size="sm"
          loading={uploading}
          onClick={() => input.current?.click()}
        >
          {value ? 'Ganti gambar' : 'Pilih gambar'}
        </Button>
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange(null)} className="text-red-600">
            <Trash2 className="size-4" /> Hapus
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
    </div>
  );
}
