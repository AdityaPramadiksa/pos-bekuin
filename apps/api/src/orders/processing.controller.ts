import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { FulfillmentDto } from './dto/fulfillment.dto';
import { ProcessingService } from './processing.service';

@ApiTags('Processing')
@ApiBearerAuth()
@Controller()
export class ProcessingController {
  constructor(private readonly processing: ProcessingService) {}

  /** Order yang sedang diproses + yang selesai hari ini (staff: hanya order miliknya). */
  @Get('processing')
  list(@CurrentUser() user: JwtPayload) {
    return this.processing.list(user);
  }

  /** PROCESSING ⇄ DONE (Selesai / Dikirim / Siap diambil). Khusus admin. */
  @Roles('ADMIN')
  @Patch('orders/:id/fulfillment')
  setStatus(@Param('id') id: string, @Body() dto: FulfillmentDto, @CurrentUser() user: JwtPayload) {
    return this.processing.setStatus(id, dto.status, user);
  }
}
