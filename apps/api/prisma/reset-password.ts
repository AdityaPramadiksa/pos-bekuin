/**
 * Perintah darurat: reset password user (mis. satu-satunya admin lupa password).
 * Password sementara dicetak ke layar; user wajib menggantinya saat login berikutnya,
 * dan semua sesi login lama dicabut.
 *
 * Laptop:   pnpm --filter @bekuin/api user:reset-password <username> [password-baru]
 * Server:   docker compose -f docker-compose.prod.yml --env-file deploy/.env exec api \
 *             node dist-seed/reset-password.js <username> [password-baru]
 * Tanpa username: tampilkan daftar user.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

/** Password sementara mudah diketik: 10 karakter tanpa huruf/angka yang mirip (0/O, 1/l). */
export function temporaryPassword(bytes: Buffer = randomBytes(10)): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return [...bytes].map((b) => chars[b % chars.length]).join('');
}

async function main() {
  const [username, given] = process.argv.slice(2);
  if (!username) {
    const users = await prisma.user.findMany({
      select: { username: true, name: true, role: true, isActive: true },
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
    });
    console.log('Pemakaian: reset-password <username> [password-baru]\n\nUser yang ada:');
    for (const u of users)
      console.log(
        `  ${u.username.padEnd(20)} ${u.role.padEnd(6)} ${u.name}${u.isActive ? '' : ' (nonaktif)'}`,
      );
    return;
  }
  if (given !== undefined && given.length < 8) {
    throw new Error('Password minimal 8 karakter');
  }
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new Error(`User "${username}" tidak ditemukan`);

  const password = given ?? temporaryPassword();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        mustChangePassword: true,
        isActive: true,
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  console.log(`Password ${user.username} (${user.role}) sudah direset.`);
  console.log(`Password sementara: ${password}`);
  console.log('Login dengan password ini, lalu aplikasi meminta password baru.');
}

if (require.main === module) {
  main()
    .catch((e: unknown) => {
      console.error(`Gagal: ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
