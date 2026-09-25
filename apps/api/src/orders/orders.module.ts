import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ProcessingController } from './processing.controller';
import { ProcessingService } from './processing.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [SettingsModule],
  controllers: [OrdersController, ProcessingController],
  providers: [OrdersService, ProcessingService],
  exports: [OrdersService, ProcessingService],
})
export class OrdersModule {}
