import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import {
  PaymentNotificationsController,
  PaymentWebhookController,
} from './payment-notifications.controller';
import { PaymentNotificationsService } from './payment-notifications.service';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentWebhookController, PaymentNotificationsController],
  providers: [PaymentNotificationsService],
})
export class PaymentNotificationsModule {}
