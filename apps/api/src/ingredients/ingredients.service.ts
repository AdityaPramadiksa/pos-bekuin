import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { IngredientView } from '@bekuin/shared';
import { rethrowPrismaError } from '../common/prisma-errors';
import type { CostGraph } from '../costing/cost-graph';
import { CostingService } from '../costing/costing.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateIngredientDto, UpdateIngredientDto } from './dto/ingredient.dto';

type IngredientRow = Prisma.IngredientGetPayload<{
  include: { producedBy: { select: { id: true } } };
}>;

function toView(i: IngredientRow, graph: CostGraph): IngredientView {
  return {
    id: i.id,
    name: i.name,
    type: i.type,
    baseUnit: i.baseUnit,
    purchaseUnit: i.purchaseUnit,
    purchaseQty: i.purchaseQty.toNumber(),
    lastPrice: i.lastPrice,
    avgCostPerUnit: i.avgCostPerUnit.toNumber(),
    unitCost: graph.unitCost(i.id).toDecimalPlaces(4).toNumber(),
    stockQty: i.stockQty.toNumber(),
    minStock: i.minStock.toNumber(),
    isActive: i.isActive,
    recipeId: i.producedBy?.id ?? null,
  };
}

const include = { producedBy: { select: { id: true } } } satisfies Prisma.IngredientInclude;

@Injectable()
export class IngredientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
  ) {}

  async list(includeInactive: boolean, type?: string): Promise<IngredientView[]> {
    const where: Prisma.IngredientWhereInput = includeInactive ? {} : { isActive: true };
    if (type === 'RAW' || type === 'SEMI_FINISHED' || type === 'PACKAGING') where.type = type;
    const [rows, graph] = await Promise.all([
      this.prisma.ingredient.findMany({
        where,
        include,
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
      }),
      this.costing.graph(),
    ]);
    return rows.map((r) => toView(r, graph));
  }

  async create(dto: CreateIngredientDto): Promise<IngredientView> {
    try {
      const row = await this.prisma.ingredient.create({
        data: { ...dto, avgCostPerUnit: new Prisma.Decimal(dto.lastPrice).div(dto.purchaseQty) },
        include,
      });
      return toView(row, await this.costing.graph());
    } catch (error) {
      rethrowPrismaError(error, 'Nama bahan sudah dipakai');
    }
  }

  /**
   * Harga/isi kemasan diubah manual → biaya per unit ikut diperbarui, sehingga HPP langsung berubah.
   * (Stok masuk memperbarui biaya secara rata-rata tertimbang.)
   */
  async update(id: string, dto: UpdateIngredientDto): Promise<IngredientView> {
    const current = await this.prisma.ingredient.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Bahan tidak ditemukan');
    if (
      current.type === 'SEMI_FINISHED' &&
      (dto.lastPrice !== undefined || dto.purchaseQty !== undefined)
    ) {
      throw new BadRequestException('Biaya bahan setengah jadi dihitung dari resepnya');
    }
    const data: Prisma.IngredientUpdateInput = { ...dto };
    if (dto.lastPrice !== undefined || dto.purchaseQty !== undefined) {
      const price = dto.lastPrice ?? current.lastPrice;
      const qty = new Prisma.Decimal(dto.purchaseQty ?? current.purchaseQty);
      data.avgCostPerUnit = new Prisma.Decimal(price).div(qty);
    }
    try {
      const row = await this.prisma.ingredient.update({ where: { id }, data, include });
      return toView(row, await this.costing.graph());
    } catch (error) {
      rethrowPrismaError(error, 'Nama bahan sudah dipakai');
    }
  }
}
