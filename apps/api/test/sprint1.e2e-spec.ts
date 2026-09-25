/**
 * Test e2e Sprint 1 terhadap database sungguhan (butuh DATABASE_URL + migrasi + seed).
 * Data uji memakai nama berawalan "e2e" dan dibersihkan di afterAll.
 */
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { LocalDiskStorage } from '../src/uploads/storage';

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Sprint 1: pengguna, menu, pengaturan (e2e)', () => {
  let app: NestExpressApplication;
  const prisma = new PrismaClient();
  const suffix = Date.now().toString(36);
  const productName = `e2e Dimsum ${suffix}`;
  let adminToken: string;
  let staffToken: string;
  let frozenId: string;
  let uploadedFile: string | undefined;
  let originalSettings: unknown;

  const api = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);
  const asStaff = (req: request.Test) => req.set('Authorization', `Bearer ${staffToken}`);

  async function login(username: string) {
    const res = await api().post('/api/v1/auth/login').send({ username, password: 'rahasia123' });
    expect(res.status).toBe(200);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();

    const passwordHash = await bcrypt.hash('rahasia123', 4);
    for (const role of ['ADMIN', 'STAFF'] as const) {
      await prisma.user.create({
        data: {
          name: `e2e ${role}`,
          username: `e2e_${role.toLowerCase()}_${suffix}`,
          role,
          passwordHash,
          mustChangePassword: false,
        },
      });
    }
    adminToken = await login(`e2e_admin_${suffix}`);
    staffToken = await login(`e2e_staff_${suffix}`);
    frozenId = (await prisma.salesCategory.findUniqueOrThrow({ where: { code: 'FROZEN' } })).id;
    originalSettings = await prisma.setting.findUnique({ where: { id: 'default' } });
  });

  afterAll(async () => {
    const product = await prisma.product.findUnique({ where: { name: productName } });
    if (product) {
      await prisma.productVariant.deleteMany({ where: { productId: product.id } });
      await prisma.product.delete({ where: { id: product.id } });
    }
    await prisma.user.deleteMany({ where: { username: { endsWith: `_${suffix}` } } });
    if (originalSettings) {
      const { id: _id, updatedAt: _u, ...rest } = originalSettings as Record<string, unknown>;
      await prisma.setting.update({ where: { id: 'default' }, data: rest });
    }
    if (uploadedFile) {
      const root = app.get(LocalDiskStorage).root;
      await unlink(path.join(root, uploadedFile.replace(/^\/uploads\//, ''))).catch(
        () => undefined,
      );
    }
    await prisma.$disconnect();
    await app.close();
  });

  describe('hak akses', () => {
    it('menolak request tanpa token', async () => {
      await api().get('/api/v1/catalog').expect(401);
    });

    it('menolak staff di endpoint admin', async () => {
      await asStaff(api().get('/api/v1/users')).expect(403);
      await asStaff(api().post('/api/v1/products').send({ name: 'x' })).expect(403);
      await asStaff(api().patch('/api/v1/settings').send({ storeName: 'x' })).expect(403);
      await asStaff(api().post('/api/v1/uploads?purpose=menu')).expect(403);
    });

    it('mengizinkan staff membaca katalog dan pengaturan', async () => {
      await asStaff(api().get('/api/v1/catalog')).expect(200);
      await asStaff(api().get('/api/v1/settings')).expect(200);
    });
  });

  describe('CRUD menu', () => {
    let productId: string;

    it('membuat produk dan varian', async () => {
      const created = await asAdmin(api().post('/api/v1/products'))
        .send({ name: productName })
        .expect(201);
      productId = created.body.id;
      expect(created.body.variants).toEqual([]);

      const withVariant = await asAdmin(api().post(`/api/v1/products/${productId}/variants`))
        .send({ categoryId: frozenId, packSize: 6, price: 22000 })
        .expect(201);
      expect(withVariant.body.variants).toHaveLength(1);
      expect(withVariant.body.variants[0]).toMatchObject({
        categoryCode: 'FROZEN',
        packSize: 6,
        price: 22000,
      });
    });

    it('menolak nama ganda, varian ganda, dan harga tidak valid', async () => {
      await asAdmin(api().post('/api/v1/products')).send({ name: productName }).expect(409);
      await asAdmin(api().post(`/api/v1/products/${productId}/variants`))
        .send({ categoryId: frozenId, packSize: 6, price: 25000 })
        .expect(409);
      await asAdmin(api().post(`/api/v1/products/${productId}/variants`))
        .send({ categoryId: frozenId, packSize: 9, price: 0 })
        .expect(400);
      await asAdmin(api().post(`/api/v1/products/${productId}/variants`))
        .send({ categoryId: frozenId, packSize: 9, price: 1500.5 })
        .expect(400);
    });

    it('produk muncul di katalog, lalu hilang setelah dinonaktifkan', async () => {
      const inCatalog = async () =>
        (await asStaff(api().get('/api/v1/catalog')).expect(200)).body.products.find(
          (p: { id: string }) => p.id === productId,
        );

      expect(await inCatalog()).toMatchObject({ isAvailable: true, availablePcs: 0 });

      await asAdmin(api().patch(`/api/v1/products/${productId}/availability`))
        .send({ isAvailable: false })
        .expect(200);
      expect(await inCatalog()).toMatchObject({ isAvailable: false });

      const removed = await asAdmin(api().delete(`/api/v1/products/${productId}`)).expect(200);
      expect(removed.body.isActive).toBe(false);
      expect(await inCatalog()).toBeUndefined();
    });

    it('menghapus varian yang belum pernah dipesan', async () => {
      const product = await asAdmin(api().get(`/api/v1/products/${productId}`)).expect(200);
      const variantId = product.body.variants[0].id;
      const after = await asAdmin(
        api().delete(`/api/v1/products/${productId}/variants/${variantId}`),
      ).expect(200);
      expect(after.body.variants).toHaveLength(0);
    });
  });

  describe('upload & pengaturan', () => {
    it('menerima gambar asli dan menyajikannya', async () => {
      const res = await asAdmin(api().post('/api/v1/uploads?purpose=menu'))
        .attach('file', PNG_1PX, 'foto.png')
        .expect(201);
      uploadedFile = res.body.url;
      expect(uploadedFile).toMatch(/^\/uploads\/menu\/\d{4}-\d{2}\/[\w-]+\.png$/);
      await api().get(uploadedFile!).expect(200);
    });

    it('menolak file yang bukan gambar walau bernama .jpg', async () => {
      await asAdmin(api().post('/api/v1/uploads?purpose=menu'))
        .attach('file', Buffer.from('<?php echo 1;'), 'foto.jpg')
        .expect(400);
    });

    it('memvalidasi jam buka dan menyimpan pengaturan', async () => {
      await asAdmin(api().patch('/api/v1/settings'))
        .send({ openingHours: { senin: ['09:00', '21:00'] } })
        .expect(400);
      const res = await asAdmin(api().patch('/api/v1/settings'))
        .send({ openingHours: { mon: ['09:00', '21:00'], sun: null }, qrMaxOrderTotal: 500000 })
        .expect(200);
      expect(res.body).toMatchObject({
        qrMaxOrderTotal: 500000,
        openingHours: { mon: ['09:00', '21:00'] },
      });
    });
  });

  describe('pengguna', () => {
    it('membuat user baru yang wajib ganti password', async () => {
      const res = await asAdmin(api().post('/api/v1/users'))
        .send({
          name: 'e2e Kasir',
          username: `E2E_Kasir_${suffix}`,
          password: 'kasir12345',
          role: 'STAFF',
        })
        .expect(201);
      expect(res.body).toMatchObject({ username: `e2e_kasir_${suffix}`, mustChangePassword: true });
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('tidak bisa menonaktifkan akun admin sendiri', async () => {
      const me = await asAdmin(api().get('/api/v1/auth/me')).expect(200);
      await asAdmin(api().patch(`/api/v1/users/${me.body.id}`))
        .send({ isActive: false })
        .expect(400);
    });
  });
});
