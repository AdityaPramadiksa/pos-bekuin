import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import type { Env } from './config/env';
import { LocalDiskStorage } from './uploads/storage';

/** Konfigurasi global aplikasi; dipakai main.ts dan test e2e agar perilakunya sama. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService<Env, true>);

  // IP asli pelanggan (untuk rate limit) saat API berada di belakang proxy.
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  app.set(
    'trust proxy',
    /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'false' ? false : trustProxy,
  );

  // cross-origin: foto menu/QRIS boleh ditampilkan oleh web yang beda domain dengan API.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({
    origin: config
      .get('CORS_ORIGIN', { infer: true })
      .split(',')
      .map((o) => o.trim()),
    credentials: true,
    // Nama file export laporan dibaca frontend dari header ini.
    exposedHeaders: ['Content-Disposition'],
  });
  // File upload (development: disk lokal) disajikan di /uploads.
  app.useStaticAssets(app.get(LocalDiskStorage).root, {
    prefix: '/uploads',
    index: false,
    fallthrough: false,
    maxAge: '7d',
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
}
