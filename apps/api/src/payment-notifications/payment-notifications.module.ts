import { Module } from '@nestjs/common';
import {
  PaymentNotificationsController,
  PaymentWebhookController,
} from './payment-notifications.controller';
import { PaymentNotificationsService } from './payment-notifications.service';

@Module({
  controllers: [PaymentWebhookController, PaymentNotificationsController],
  providers: [PaymentNotificationsService],
})
export class PaymentNotificationsModule {}
