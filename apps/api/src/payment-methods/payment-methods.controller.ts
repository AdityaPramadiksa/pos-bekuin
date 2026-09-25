import { Body, Controller, Get, Param, ParseBoolPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/payment-method.dto';
import { PaymentMethodsService } from './payment-methods.service';

@ApiTags('Payment Methods')
@ApiBearerAuth()
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly methods: PaymentMethodsService) {}

  @Get()
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    return this.methods.list(user.role === 'ADMIN' && !!includeInactive);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreatePaymentMethodDto) {
    return this.methods.create(dto);
  }

  /** Tidak ada hapus: nonaktifkan lewat isActive = false (metode lama tetap tercatat di order). */
  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.methods.update(id, dto);
  }
}
