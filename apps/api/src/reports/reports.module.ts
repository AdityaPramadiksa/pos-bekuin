import { Module } from '@nestjs/common';
import { ProductionPlanModule } from '../production-plan/production-plan.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ProductionPlanModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
