import { BadRequestException, Injectable } from '@nestjs/common';
import { MAX_UPLOAD_BYTES, type UploadPurpose } from '@bekuin/shared';
import { randomUUID } from 'node:crypto';
import { FileStorage } from './storage';

type ImageType = 'jpg' | 'png' | 'webp';

/** Deteksi tipe gambar dari isi file (magic bytes), bukan dari nama/mimetype kiriman klien. */
export function detectImageType(data: Buffer): ImageType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

@Injectable()
export class UploadsService {
  constructor(private readonly storage: FileStorage) {}

  async saveImage(file: Express.Multer.File | undefined, purpose: UploadPurpose): Promise<string> {
    if (!file) throw new BadRequestException('File belum dipilih');
    if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException('Ukuran file maksimal 5 MB');
    const type = detectImageType(file.buffer);
    if (!type) throw new BadRequestException('File harus berupa gambar JPG, PNG, atau WebP');

    const month = new Date().toISOString().slice(0, 7); // YYYY-MM
    return this.storage.save(`${purpose}/${month}/${randomUUID()}.${type}`, file.buffer);
  }
}
