import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { validateEnv } from './config/env';
import { CashSessionsModule } from './cash-sessions/cash-sessions.module';
import { CostingModule } from './costing/costing.module';
import { CustomersModule } from './customers/customers.module';
import { HealthController } from './health/health.controller';
import { ExpensesModule } from './expenses/expenses.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { MenuModule } from './menu/menu.module';
import { OpnamesModule } from './opnames/opnames.module';
import { OrderImportModule } from './order-import/order-import.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductAliasesModule } from './product-aliases/product-aliases.module';
import { ProductionsModule } from './productions/productions.module';
import { PaymentNotificationsModule } from './payment-notifications/payment-notifications.module';
import { PublicModule } from './public/public.module';
import { PushModule } from './push/push.module';
import { PurchasesModule } from './purchases/purchases.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RecipesModule } from './recipes/recipes.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { StockModule } from './stock/stock.module';
import { TablesModule } from './tables/tables.module';
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
    CostingModule,
    MenuModule,
    IngredientsModule,
    RecipesModule,
    RealtimeModule,
    PushModule,
    StockModule,
    OrdersModule,
    ReportsModule,
    TablesModule,
    PublicModule,
    PaymentNotificationsModule,
    PurchasesModule,
    ProductionsModule,
    OpnamesModule,
    CustomersModule,
    ProductAliasesModule,
    OrderImportModule,
    CashSessionsModule,
    ExpensesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
