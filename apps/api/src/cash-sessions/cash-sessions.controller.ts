import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CashSessionsService } from './cash-sessions.service';
import { CloseCashSessionDto, OpenCashSessionDto } from './dto/cash-session.dto';

@ApiTags('Cash sessions (shift kasir)')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('cash-sessions')
export class CashSessionsController {
  constructor(private readonly sessions: CashSessionsService) {}

  /** Shift yang sedang terbuka (null bila tidak ada). */
  @Get('current')
  current() {
    return this.sessions.current();
  }

  @Get()
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  list(@Query('from') from?: string, @Query('to') to?: string) {
    return this.sessions.list(from, to);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.sessions.get(id);
  }

  @Post('open')
  open(@Body() dto: OpenCashSessionDto, @CurrentUser() user: JwtPayload) {
    return this.sessions.open(dto, user);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(
    @Param('id') id: string,
    @Body() dto: CloseCashSessionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.sessions.close(id, dto, user);
  }
}
