import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CategoriesService } from './categories.service';
import { MenuController } from './menu.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [MenuController],
  providers: [CategoriesService, ProductsService, CatalogService],
  exports: [CatalogService],
})
export class MenuModule {}
