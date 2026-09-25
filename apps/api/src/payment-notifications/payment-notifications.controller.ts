import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicThrottlerGuard } from '../common/public-throttler.guard';
import { PaymentNotificationDto, TestNotificationDto } from './dto/payment-notification.dto';
import { PaymentNotificationsService } from './payment-notifications.service';

/** Webhook dari MacroDroid di HP admin. Pengaman: kunci acak di URL (bisa diganti) + rate limit. */
@ApiTags('Public (webhook pembayaran)')
@Public()
@UseGuards(PublicThrottlerGuard)
@Controller('public/payment-notifications')
export class PaymentWebhookController {
  constructor(private readonly service: PaymentNotificationsService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':key')
  @HttpCode(200)
  receive(@Param('key') key: string, @Body() dto: PaymentNotificationDto) {
    return this.service.receive(key, dto);
  }
}

@ApiTags('Notifikasi pembayaran')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('payment-notifications')
export class PaymentNotificationsController {
  constructor(private readonly service: PaymentNotificationsService) {}

  /** URL webhook + 30 notifikasi terakhir. */
  @Get('setup')
  setup() {
    return this.service.setup();
  }

  @Post('rotate-key')
  @HttpCode(200)
  rotate() {
    return this.service.rotateKey();
  }

  /** Coba teks notifikasi tanpa menyetujui order. */
  @Post('test')
  @HttpCode(200)
  test(@Body() dto: TestNotificationDto) {
    return this.service.test(dto);
  }
}
