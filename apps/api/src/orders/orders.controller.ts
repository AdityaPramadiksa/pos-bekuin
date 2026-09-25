import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { SettingsService } from '../settings/settings.service';
import {
  ApproveOrderDto,
  BulkApproveDto,
  CreateOrderDto,
  ListOrdersDto,
  MarkPaidDto,
  OptionalReasonDto,
  ReasonDto,
  UpdateOrderDto,
} from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly settings: SettingsService,
  ) {}

  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: JwtPayload) {
    return this.orders.createFromStaff(dto, user);
  }

  @Get()
  list(@Query() query: ListOrdersDto, @CurrentUser() user: JwtPayload) {
    return this.orders.list(query, user);
  }

  /** Daftar packing per tanggal kirim (order PENDING & PAID). */
  @Roles('ADMIN')
  @Get('packing-list')
  packingList(@Query('date') date: string, @CurrentUser() user: JwtPayload) {
    return this.orders.list(
      {
        dateField: 'delivery',
        from: date,
        to: date,
        status: 'PENDING,PAID',
        sort: 'oldest',
        limit: 500,
      },
      user,
    );
  }

  /** Approve banyak order sekaligus, masing-masing transaksi sendiri. */
  @Roles('ADMIN')
  @Post('bulk-approve')
  @HttpCode(200)
  bulkApprove(@Body() dto: BulkApproveDto, @CurrentUser() user: JwtPayload) {
    return this.orders.bulkApprove(dto.orderIds, dto.paymentMethodId, user, dto.payLater);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.orders.get(id, user);
  }

  /** Edit selama PENDING (staff: miliknya sendiri). */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto, @CurrentUser() user: JwtPayload) {
    return this.orders.update(id, dto, user);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() dto: OptionalReasonDto, @CurrentUser() user: JwtPayload) {
    return this.orders.cancel(id, dto.reason, user);
  }

  @Roles('ADMIN')
  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @Body() dto: ApproveOrderDto, @CurrentUser() user: JwtPayload) {
    return this.orders.approve(id, dto, user);
  }

  /** Order COD / bayar saat ambil: uang sudah diterima. */
  @Roles('ADMIN')
  @Post(':id/mark-paid')
  @HttpCode(200)
  markPaid(@Param('id') id: string, @Body() dto: MarkPaidDto, @CurrentUser() user: JwtPayload) {
    return this.orders.markPaid(id, dto, user);
  }

  @Roles('ADMIN')
  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: JwtPayload) {
    return this.orders.reject(id, dto.reason, user);
  }

  /** Void order lunas (wajib alasan): stok dikembalikan, order tetap tercatat. */
  @Roles('ADMIN')
  @Post(':id/void')
  @HttpCode(200)
  void(@Param('id') id: string, @Body() dto: ReasonDto, @CurrentUser() user: JwtPayload) {
    return this.orders.void(id, dto.reason, user);
  }

  /** Data siap cetak: order + info toko. */
  @Roles('ADMIN')
  @Get(':id/receipt')
  async receipt(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    const [order, store] = await Promise.all([this.orders.get(id, user), this.settings.get()]);
    return { order, store };
  }
}
