import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [SettingsModule],
  controllers: [OrdersController, KitchenController],
  providers: [OrdersService, KitchenService],
  exports: [OrdersService, KitchenService],
})
export class OrdersModule {}
