import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Env } from '../config/env';

/**
 * Tempat menyimpan file. Development: disk lokal (disajikan di /uploads).
 * Produksi nanti: ganti implementasi ini ke S3-compatible (Cloudflare R2 / Supabase Storage).
 */
export abstract class FileStorage {
  /** Simpan file dan kembalikan URL publiknya. */
  abstract save(key: string, data: Buffer): Promise<string>;
}

@Injectable()
export class LocalDiskStorage extends FileStorage {
  readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.root = path.resolve(config.get('UPLOAD_DIR', { infer: true }));
  }

  async save(key: string, data: Buffer): Promise<string> {
    const target = path.join(this.root, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
    return `/uploads/${key}`;
  }
}
