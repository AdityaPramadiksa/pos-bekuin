import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
};

describe('validateEnv', () => {
  it('default development berjalan', () => {
    expect(validateEnv(base)).toMatchObject({ NODE_ENV: 'development', PORT: 3000 });
  });

  it('production menolak rahasia contoh dari .env.example', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'ganti-dengan-rahasia-access-minimal-32-karakter',
      }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('production menolak rahasia access = refresh', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', JWT_REFRESH_SECRET: base.JWT_ACCESS_SECRET }),
    ).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('rahasia pendek ditolak', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'pendek' })).toThrow(/32/);
  });
});
