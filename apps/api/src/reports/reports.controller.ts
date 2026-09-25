import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { todayKey } from '../common/dates';
import { ProductionPlanService } from '../production-plan/production-plan.service';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly plans: ProductionPlanService,
  ) {}

  /** Ringkasan hari ini untuk Dashboard. */
  @Get('today')
  today() {
    return this.reports.today();
  }

  /** Rekap produksi dari order PENDING tanggal kirim terpilih (default besok). */
  @Get('production-plan')
  productionPlan(@Query('date') date?: string) {
    return this.plans.plan(date ?? todayKey());
  }
}
