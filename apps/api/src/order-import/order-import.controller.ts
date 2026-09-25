import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { ImportPreviewDto, ImportSaveDto } from './dto/import.dto';
import { OrderImportService } from './order-import.service';

@ApiTags('Orders — Tempel Pesan WhatsApp')
@ApiBearerAuth()
@Controller('orders/import')
export class OrderImportController {
  constructor(private readonly importer: OrderImportService) {}

  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: ImportPreviewDto) {
    return this.importer.preview(dto);
  }

  @Post()
  save(@Body() dto: ImportSaveDto, @CurrentUser() user: JwtPayload) {
    return this.importer.save(dto, user);
  }
}
