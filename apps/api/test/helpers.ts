import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, type Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

export const PASSWORD = 'rahasia123';

/** Aplikasi + klien Prisma + pembuat user sementara untuk test e2e. */
export async function createTestContext(prefix: string) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  const prisma = new PrismaClient();
  const suffix = `${prefix}_${Date.now().toString(36)}`;
  const passwordHash = await bcrypt.hash(PASSWORD, 4);

  const api = () => request(app.getHttpServer());

  async function user(role: Role, name = role.toLowerCase()) {
    const username = `e2e_${name}_${suffix}`;
    const created = await prisma.user.create({
      data: { name: `e2e ${name}`, username, role, passwordHash, mustChangePassword: false },
    });
    const res = await api().post('/api/v1/auth/login').send({ username, password: PASSWORD });
    if (res.status !== 200) throw new Error(`login gagal: ${JSON.stringify(res.body)}`);
    const token = res.body.accessToken as string;
    return {
      id: created.id,
      token,
      as: (req: request.Test) => req.set('Authorization', `Bearer ${token}`),
    };
  }

  /**
   * Pastikan ada shift kasir terbuka (approve cash mewajibkannya). Shift yang dibuat di sini
   * dihapus lagi saat close(); shift milik data lokal yang sudah terbuka dipakai apa adanya.
   */
  const createdShifts: string[] = [];
  async function cashShift(openedById: string): Promise<string> {
    const open = await prisma.cashSession.findFirst({ where: { status: 'OPEN' } });
    if (open) return open.id;
    const created = await prisma.cashSession.create({ data: { openedById, openingCash: 0 } });
    createdShifts.push(created.id);
    return created.id;
  }

  async function close() {
    if (createdShifts.length) {
      const where = { cashSessionId: { in: createdShifts } };
      await prisma.order.updateMany({ where, data: { cashSessionId: null } });
      await prisma.expense.updateMany({ where, data: { cashSessionId: null } });
      await prisma.cashSession.deleteMany({ where: { id: { in: createdShifts } } });
    }
    await prisma.user.deleteMany({ where: { username: { endsWith: `_${suffix}` } } });
    await prisma.$disconnect();
    await app.close();
  }

  return { app, prisma, api, user, suffix, cashShift, close };
}
