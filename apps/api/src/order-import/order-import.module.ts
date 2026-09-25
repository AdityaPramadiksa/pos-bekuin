import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { OrderImportController } from './order-import.controller';
import { OrderImportService } from './order-import.service';

@Module({
  imports: [OrdersModule],
  controllers: [OrderImportController],
  providers: [OrderImportService],
})
export class OrderImportModule {}
