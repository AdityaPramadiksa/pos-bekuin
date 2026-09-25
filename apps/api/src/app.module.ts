import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env';
import { HealthController } from './health/health.controller';
import { MenuModule } from './menu/menu.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    AuthModule,
    UploadsModule,
    UsersModule,
    SettingsModule,
    PaymentMethodsModule,
    MenuModule,
    // Modul berikutnya (lihat PRD bagian 10): Stock, Orders, Realtime (Sprint 2), Tables,
    // Public, Kitchen (Sprint 3), Ingredients, Recipes, Purchases, Production, Opname,
    // Customers, OrderImport, Expenses, CashSessions, Reports.
  ],
  controllers: [HealthController],
})
export class AppModule {}
