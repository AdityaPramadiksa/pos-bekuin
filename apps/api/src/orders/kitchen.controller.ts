import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { FulfillmentDto } from './dto/fulfillment.dto';
import { KitchenService } from './kitchen.service';

@ApiTags('Kitchen')
@ApiBearerAuth()
@Controller()
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  @Get('kitchen/queue')
  queue(@CurrentUser() user: JwtPayload) {
    return this.kitchen.queue(user);
  }

  /** QUEUED → PREPARING → READY → HANDED_OVER (juga dipakai status packing pre-order). */
  @Patch('orders/:id/fulfillment')
  setStatus(@Param('id') id: string, @Body() dto: FulfillmentDto, @CurrentUser() user: JwtPayload) {
    return this.kitchen.setStatus(id, dto.status, user);
  }
}
