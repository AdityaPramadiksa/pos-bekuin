import { z } from 'zod';

const envSchema = z.object({
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
