import { Global, Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockQueries } from './stock.queries';
import { StockService } from './stock.service';

@Global()
@Module({
  controllers: [StockController],
  providers: [StockService, StockQueries],
  exports: [StockService],
})
export class StockModule {}
