import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    // Modul berikutnya (lihat PRD bagian 10): Users, Menu, Orders, Tables, PublicOrder,
    // Stock, Purchases, Production, Opname, Expenses, CashSessions, Reports, Settings.
  ],
  controllers: [HealthController],
})
export class AppModule {}
