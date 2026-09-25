/** Sprint 8: Web Push (langganan), header keamanan & CORS. */
import { createTestContext } from './helpers';

describe('Sprint 8: push & keamanan (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof createTestContext>>;
  let staff: Awaited<ReturnType<typeof ctx.user>>;
  const api = () => ctx.api();
  const endpoint = (id: string) => `https://fcm.googleapis.com/fcm/send/e2e-${id}`;
  const keys = { p256dh: 'BExamplePublicKeyValue', auth: 'exampleAuth' };

  beforeAll(async () => {
    ctx = await createTestContext('s8');
    staff = await ctx.user('STAFF');
  });

  afterAll(async () => {
    await ctx.prisma.pushSubscription.deleteMany({ where: { endpoint: { contains: '/e2e-' } } });
    await ctx.close();
  });

  it('public key: wajib login, nonaktif bila VAPID kosong', async () => {
    await api().get('/api/v1/push/public-key').expect(401);
    const res = await staff.as(api().get('/api/v1/push/public-key')).expect(200);
    expect(res.body).toHaveProperty('enabled');
    if (!res.body.enabled) expect(res.body.publicKey).toBeNull();
  });

  it('langganan: hanya layanan push resmi (cegah SSRF), idempoten per endpoint', async () => {
    const id = ctx.suffix;
    await staff
      .as(api().post('/api/v1/push/subscribe'))
      .send({ endpoint: endpoint(id), keys })
      .expect(200);
    await staff
      .as(api().post('/api/v1/push/subscribe'))
      .send({ endpoint: endpoint(id), keys })
      .expect(200);
    expect(await ctx.prisma.pushSubscription.count({ where: { endpoint: endpoint(id) } })).toBe(1);

    for (const bad of [
      'https://169.254.169.254/latest/meta-data',
      'https://evil.example.com/push',
      'http://fcm.googleapis.com/fcm/send/x',
    ]) {
      await staff
        .as(api().post('/api/v1/push/subscribe'))
        .send({ endpoint: bad, keys })
        .expect(400);
    }

    await staff
      .as(api().delete('/api/v1/push/subscribe'))
      .send({ endpoint: endpoint(id) })
      .expect(200);
    expect(await ctx.prisma.pushSubscription.count({ where: { endpoint: endpoint(id) } })).toBe(0);
  });

  it('header keamanan helmet & CORS hanya untuk origin yang diizinkan', async () => {
    const res = await api().get('/api/v1/health').set('Origin', 'https://evil.example.com');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const allowed = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',')[0].trim();
    const ok = await api().get('/api/v1/health').set('Origin', allowed);
    expect(ok.headers['access-control-allow-origin']).toBe(allowed);
  });
});
