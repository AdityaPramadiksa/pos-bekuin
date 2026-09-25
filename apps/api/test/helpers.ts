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

  async function close() {
    await prisma.user.deleteMany({ where: { username: { endsWith: `_${suffix}` } } });
    await prisma.$disconnect();
    await app.close();
  }

  return { app, prisma, api, user, suffix, close };
}
