import jsQR from 'jsqr';

/**
 * Baca isi QR dari gambar (URL). Gambar besar diperkecil dulu; dicoba beberapa ukuran
 * karena QR di stiker QRIS kadang terlalu kecil/besar untuk sekali baca.
 */
export async function decodeQrFromUrl(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Gambar QRIS tidak bisa dibuka');
  const bitmap = await createImageBitmap(await res.blob());
  try {
    for (const maxSide of [1200, 800, 1600]) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
      if (found?.data) return found.data;
    }
    return null;
  } finally {
    bitmap.close();
  }
}
