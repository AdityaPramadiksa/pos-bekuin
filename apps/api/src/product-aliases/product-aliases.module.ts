import { Module } from '@nestjs/common';
import { ProductAliasesController } from './product-aliases.controller';

@Module({ controllers: [ProductAliasesController] })
export class ProductAliasesModule {}
