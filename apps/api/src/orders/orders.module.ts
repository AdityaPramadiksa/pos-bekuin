import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ProcessingController } from './processing.controller';
import { ProcessingService } from './processing.service';
import { UnpaidOrdersService } from './unpaid-orders.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [SettingsModule],
  controllers: [OrdersController, ProcessingController],
  providers: [OrdersService, ProcessingService, UnpaidOrdersService],
  exports: [OrdersService, ProcessingService, UnpaidOrdersService],
})
export class OrdersModule {}
