import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateProductionDto, ProductionPreviewDto } from './dto/production.dto';
import { ProductionsService } from './productions.service';

@ApiTags('Productions')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('productions')
export class ProductionsController {
  constructor(private readonly productions: ProductionsService) {}

  @Get()
  list() {
    return this.productions.list();
  }

  /** Cek kebutuhan bahan & stok tanpa mengubah apa pun. */
  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: ProductionPreviewDto) {
    return this.productions.preview(dto);
  }

  @Post()
  create(@Body() dto: CreateProductionDto, @CurrentUser() user: JwtPayload) {
    return this.productions.create(dto, user.sub);
  }
}
