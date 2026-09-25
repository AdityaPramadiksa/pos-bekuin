import { Body, Controller, Delete, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { SubscribePushDto, UnsubscribePushDto } from './dto/push.dto';
import { PushService } from './push.service';

/** Web Push untuk staff & admin (login wajib, role apa saja). */
@ApiTags('Push notification')
@ApiBearerAuth()
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('public-key')
  publicKey() {
    return this.push.publicKey();
  }

  @Post('subscribe')
  @HttpCode(200)
  subscribe(
    @Body() dto: SubscribePushDto,
    @CurrentUser() user: JwtPayload,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.push.subscribe(user.sub, dto, userAgent);
  }

  @Delete('subscribe')
  unsubscribe(@Body() dto: UnsubscribePushDto, @CurrentUser() user: JwtPayload) {
    return this.push.unsubscribe(user.sub, dto.endpoint);
  }
}
