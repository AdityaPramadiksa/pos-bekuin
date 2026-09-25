/**
 * Kecilkan foto sebelum upload: sisi terpanjang maks `maxSide` px, format WebP,
 * kualitas diturunkan bertahap sampai ukuran ≤ `targetBytes` (PRD 5.7: foto menu ≤ 200 KB).
 */
export async function compressImage(
  file: File,
  { maxSide = 1024, targetBytes = 200 * 1024 } = {},
): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let quality = 0.85;
  let blob = await toBlob(canvas, quality);
  while (blob.size > targetBytes && quality > 0.4) {
    quality -= 0.1;
    blob = await toBlob(canvas, quality);
  }
  return blob;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Gagal memproses gambar'))),
      'image/webp',
      quality,
    ),
  );
}
