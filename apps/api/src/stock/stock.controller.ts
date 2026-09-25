import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto, MovementQueryDto } from './dto/stock.dto';
import { StockQueries } from './stock.queries';
import { StockService } from './stock.service';

@ApiTags('Stock')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('stock')
export class StockController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly queries: StockQueries,
  ) {}

  @Get('products')
  products() {
    return this.queries.products();
  }

  @Get('ingredients')
  @ApiQuery({ name: 'type', required: false, enum: ['RAW', 'SEMI_FINISHED', 'PACKAGING'] })
  ingredients(@Query('type') type?: string) {
    return this.queries.ingredients(type);
  }

  @Get('movements')
  movements(@Query() query: MovementQueryDto) {
    return this.queries.movements(query);
  }

  /** Penyesuaian manual (stok awal, koreksi) atau barang rusak/basi (WASTE). */
  @Post('adjust')
  async adjust(@Body() dto: AdjustStockDto, @CurrentUser() user: JwtPayload) {
    if (dto.reason === 'WASTE' && dto.mode !== 'SUBTRACT') {
      throw new BadRequestException('Waste (rusak/basi) hanya bisa mengurangi stok');
    }
    if (dto.itemType === 'PRODUCT' && !Number.isInteger(dto.qty)) {
      throw new BadRequestException('Stok produk harus bilangan bulat (pcs)');
    }
    return this.prisma.$transaction(async (tx) => {
      const current =
        dto.itemType === 'PRODUCT'
          ? (await tx.product.findUnique({ where: { id: dto.itemId }, select: { stockPcs: true } }))
              ?.stockPcs
          : (
              await tx.ingredient.findUnique({
                where: { id: dto.itemId },
                select: { stockQty: true },
              })
            )?.stockQty;
      if (current === undefined) throw new NotFoundException('Item stok tidak ditemukan');

      const qty = new Prisma.Decimal(dto.qty);
      const delta =
        dto.mode === 'ADD'
          ? qty
          : dto.mode === 'SUBTRACT'
            ? qty.neg()
            : qty.minus(new Prisma.Decimal(current));
      if (delta.isZero()) throw new BadRequestException('Tidak ada perubahan stok');

      const [result] = await this.stock.apply(
        tx,
        [{ itemType: dto.itemType, id: dto.itemId, qty: delta }],
        { type: dto.reason, userId: user.sub, refType: 'ADJUST', note: dto.note },
      );
      return {
        name: result.name,
        qtyChange: result.qtyChange.toNumber(),
        balanceAfter: result.balanceAfter.toNumber(),
      };
    });
  }
}
