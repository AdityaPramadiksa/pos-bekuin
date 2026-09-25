import { BadRequestException, Controller, Get, Param, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { REPORT_TYPES, type ReportType } from '@bekuin/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { todayKey } from '../common/dates';
import { ProductionPlanService } from '../production-plan/production-plan.service';
import { toCsv, toSheets, toXlsx, type ReportData } from './report-export';
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

  /** Ringkasan hari ini untuk Dashboard (termasuk grafik 7 hari & status shift). */
  @Get('today')
  today() {
    return this.reports.today();
  }

  /** Rekap produksi dari order PENDING tanggal kirim terpilih (default besok). */
  @Get('production-plan')
  productionPlan(@Query('date') date?: string) {
    return this.plans.plan(date ?? todayKey());
  }

  @Get(':type/export')
  @ApiQuery({ name: 'format', enum: ['csv', 'xlsx'] })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async export(
    @Param('type') type: string,
    @Query('format') format = 'xlsx',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!REPORT_TYPES.includes(type as ReportType)) {
      throw new BadRequestException('Jenis laporan tidak dikenal');
    }
    if (format !== 'csv' && format !== 'xlsx') {
      throw new BadRequestException('Format harus csv atau xlsx');
    }
    const reportType = type as ReportType;
    const data = await this.load(reportType, from, to);
    const sheets = toSheets(reportType, data);
    const range =
      'date' in data ? data.date : 'range' in data ? `${data.range.from}_${data.range.to}` : '';
    const filename = `bekuin-${reportType}-${range}.${format}`;
    if (format === 'csv') {
      return new StreamableFile(Buffer.from(toCsv(sheets), 'utf8'), {
        type: 'text/csv; charset=utf-8',
        disposition: `attachment; filename="${filename}"`,
      });
    }
    return new StreamableFile(await toXlsx(reportType, sheets), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':type')
  @ApiQuery({ name: 'from', required: false, description: 'YYYY-MM-DD (WITA)' })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'date', required: false, description: 'Khusus daily-closing' })
  report(
    @Param('type') type: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('date') date?: string,
  ) {
    if (!REPORT_TYPES.includes(type as ReportType)) {
      throw new BadRequestException('Jenis laporan tidak dikenal');
    }
    return this.load(type as ReportType, type === 'daily-closing' ? (date ?? from) : from, to);
  }

  private load(type: ReportType, from?: string, to?: string): Promise<ReportData> {
    switch (type) {
      case 'sales':
        return this.reports.sales(from, to);
      case 'profit-loss':
        return this.reports.profitLoss(from, to);
      case 'product-profit':
        return this.reports.productProfit(from, to);
      case 'top-products':
        return this.reports.topProducts(from, to);
      case 'cashflow':
        return this.reports.cashflow(from, to);
      case 'stock-movements':
        return this.reports.stockMovements(from, to);
      case 'shifts':
        return this.reports.shifts(from, to);
      case 'qr-service':
        return this.reports.qrService(from, to);
      case 'daily-closing':
        return this.reports.dailyClosing(from);
    }
  }
}
