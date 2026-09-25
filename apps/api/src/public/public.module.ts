import { Module } from '@nestjs/common';
import { MenuModule } from '../menu/menu.module';
import { OrdersModule } from '../orders/orders.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [MenuModule, OrdersModule],
  controllers: [PublicController],
  providers: [PublicService],
})
export class PublicModule {}
