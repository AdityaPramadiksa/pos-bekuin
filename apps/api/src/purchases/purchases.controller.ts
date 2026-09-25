import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreatePurchaseDto } from './dto/purchase.dto';
import { PurchasesService } from './purchases.service';

@ApiTags('Purchases (stok masuk)')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.purchases.list(from, to);
  }

  @Post()
  create(@Body() dto: CreatePurchaseDto, @CurrentUser() user: JwtPayload) {
    return this.purchases.create(dto, user.sub);
  }
}
