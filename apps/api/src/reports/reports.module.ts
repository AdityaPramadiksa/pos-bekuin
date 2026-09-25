import { Module } from '@nestjs/common';
import { CashSessionsModule } from '../cash-sessions/cash-sessions.module';
import { ProductionPlanModule } from '../production-plan/production-plan.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ProductionPlanModule, CashSessionsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
