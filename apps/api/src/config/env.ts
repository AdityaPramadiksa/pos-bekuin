import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    PUBLIC_WEB_URL: z.url().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL wajib diisi'),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET minimal 32 karakter'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET minimal 32 karakter'),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
    UPLOAD_DIR: z.string().default('./uploads'),
    /** Express trust proxy: 'loopback' (dev, proxy Vite), angka hop (mis. 1 di Railway), atau 'false'. */
    TRUST_PROXY: z.string().default('loopback'),
    /** Web Push (notifikasi saat aplikasi tertutup). Kosong = fitur push nonaktif. */
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default('mailto:admin@bekuin.local'),
    /** Dokumentasi Swagger di /api/docs. Default: aktif kecuali production. */
    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (env[key].startsWith('ganti-dengan')) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'masih contoh dari .env.example; buat baru dengan: openssl rand -hex 32',
        });
      }
    }
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'harus beda dengan JWT_ACCESS_SECRET',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Dipakai ConfigModule: aplikasi gagal start bila env tidak valid. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Konfigurasi .env tidak valid:\n${issues.join('\n')}`);
  }
  return result.data;
}
