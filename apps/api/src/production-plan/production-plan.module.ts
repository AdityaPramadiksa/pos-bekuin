import { Module } from '@nestjs/common';
import { ProductionPlanService } from './production-plan.service';

@Module({ providers: [ProductionPlanService], exports: [ProductionPlanService] })
export class ProductionPlanModule {}
