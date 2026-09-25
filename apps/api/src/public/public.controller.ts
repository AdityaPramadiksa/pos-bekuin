import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MAX_UPLOAD_BYTES } from '@bekuin/shared';
import { Public } from '../auth/decorators/public.decorator';
import { PublicThrottlerGuard } from '../common/public-throttler.guard';
import { CreateOnlineOrderDto, CreatePublicOrderDto } from './dto/public-order.dto';
import { PublicService, QR_ORDER_ATTEMPTS_PER_10_MIN } from './public.service';

/** Endpoint pelanggan QR (tanpa login). Lihat .claude/skills/bekuin-qr-order. */
@ApiTags('Public (pelanggan QR)')
@Public()
@UseGuards(PublicThrottlerGuard)
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('tables/:qrToken/menu')
  menu(@Param('qrToken') qrToken: string) {
    return this.publicService.menu(qrToken);
  }

  // Termasuk percobaan gagal (menu habis, dsb.) — batas utama spam adalah maks. PENDING per meja.
  @Throttle({ default: { limit: QR_ORDER_ATTEMPTS_PER_10_MIN, ttl: 10 * 60_000 } })
  @Post('orders')
  createOrder(@Body() dto: CreatePublicOrderDto) {
    return this.publicService.createOrder(dto);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('online/:onlineToken/menu')
  onlineMenu(@Param('onlineToken') onlineToken: string) {
    return this.publicService.onlineMenu(onlineToken);
  }

  // Batas utama spam order online: maks. pesanan menunggu per No. WA + limit per IP.
  @Throttle({ default: { limit: QR_ORDER_ATTEMPTS_PER_10_MIN, ttl: 10 * 60_000 } })
  @Post('online-orders')
  createOnlineOrder(@Body() dto: CreateOnlineOrderDto) {
    return this.publicService.createOnlineOrder(dto);
  }

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get('orders/:publicToken')
  getOrder(@Param('publicToken') publicToken: string) {
    return this.publicService.getOrder(publicToken);
  }

  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  @Post('orders/:publicToken/payment-proof')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  uploadProof(
    @Param('publicToken') publicToken: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.publicService.uploadProof(publicToken, file);
  }

  @Throttle({ default: { limit: 10, ttl: 10 * 60_000 } })
  @Post('orders/:publicToken/cancel')
  @HttpCode(200)
  cancel(@Param('publicToken') publicToken: string) {
    return this.publicService.cancel(publicToken);
  }
}
