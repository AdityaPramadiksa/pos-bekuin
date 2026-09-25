import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { type ProductAliasView, normalizeName } from '@bekuin/shared';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';

class CreateAliasDto {
  @ApiProperty({ example: 'dimsam ori' }) @IsString() @MinLength(2) @MaxLength(60) alias: string;
  @ApiProperty() @IsString() productId: string;
}

/** Ejaan alternatif nama produk untuk parser pesan WhatsApp. */
@ApiTags('Product Aliases')
@ApiBearerAuth()
@Controller('product-aliases')
export class ProductAliasesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(): Promise<ProductAliasView[]> {
    const rows = await this.prisma.productAlias.findMany({
      include: { product: { select: { name: true } } },
      orderBy: { alias: 'asc' },
    });
    return rows.map((a) => ({
      id: a.id,
      alias: a.alias,
      productId: a.productId,
      productName: a.product.name,
    }));
  }

  /** Staff juga boleh (tombol "Ingat sebagai alias" di preview Tempel Pesan). */
  @Post()
  async create(@Body() dto: CreateAliasDto): Promise<ProductAliasView> {
    try {
      const a = await this.prisma.productAlias.create({
        data: { alias: normalizeName(dto.alias), productId: dto.productId },
        include: { product: { select: { name: true } } },
      });
      return { id: a.id, alias: a.alias, productId: a.productId, productName: a.product.name };
    } catch (error) {
      rethrowPrismaError(error, 'Alias sudah dipakai');
    }
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.prisma.productAlias
      .delete({ where: { id } })
      .catch((error) => rethrowPrismaError(error));
  }
}
