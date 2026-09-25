import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ProductionPreview, ProductionView } from '@bekuin/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { StockService } from '../stock/stock.service';
import type { CreateProductionDto, ProductionPreviewDto } from './dto/production.dto';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const recipeInclude = {
  lines: { include: { ingredient: true } },
  product: true,
  outputIngredient: true,
} satisfies Prisma.RecipeInclude;

const productionInclude = {
  recipe: { select: { name: true } },
  product: { select: { name: true } },
  outputIngredient: { select: { name: true, baseUnit: true } },
  createdBy: { select: { name: true } },
  lines: { include: { ingredient: { select: { name: true, baseUnit: true } } } },
} satisfies Prisma.ProductionInclude;

function toView(
  p: Prisma.ProductionGetPayload<{ include: typeof productionInclude }>,
): ProductionView {
  const actual = p.actualOutput.toNumber();
  return {
    id: p.id,
    type: p.type,
    recipeName: p.recipe.name,
    outputName: p.product?.name ?? p.outputIngredient?.name ?? '-',
    outputUnit: p.outputIngredient?.baseUnit ?? 'PCS',
    batchQty: p.batchQty.toNumber(),
    expectedOutput: p.expectedOutput.toNumber(),
    actualOutput: actual,
    yieldVariance: p.yieldVariance.toNumber(),
    totalCost: p.totalCost.toDecimalPlaces(2).toNumber(),
    costPerUnit: actual > 0 ? p.totalCost.div(actual).toDecimalPlaces(4).toNumber() : 0,
    note: p.note,
    createdBy: p.createdBy.name,
    createdAt: p.createdAt.toISOString(),
    lines: p.lines.map((l) => ({
      name: l.ingredient.name,
      baseUnit: l.ingredient.baseUnit,
      qtyUsed: l.qtyUsed.toNumber(),
      unitCost: l.unitCost.toNumber(),
    })),
  };
}

@Injectable()
export class ProductionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async list(): Promise<ProductionView[]> {
    const rows = await this.prisma.production.findMany({
      include: productionInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toView);
  }

  private async loadRecipe(db: Prisma.TransactionClient | PrismaService, recipeId: string) {
    const recipe = await db.recipe.findUnique({ where: { id: recipeId }, include: recipeInclude });
    if (!recipe?.isActive) throw new NotFoundException('Resep tidak ditemukan');
    return recipe;
  }

  /** Kebutuhan bahan = qty resep × jumlah batch (produk: × pcs), dibanding stok sekarang. */
  async preview(dto: ProductionPreviewDto): Promise<ProductionPreview> {
    const recipe = await this.loadRecipe(this.prisma, dto.recipeId);
    if (recipe.type === 'PRODUCT' && !Number.isInteger(dto.batchQty)) {
      throw new BadRequestException('Jumlah produksi produk harus bilangan bulat (pcs)');
    }
    const needs = recipe.lines.map((l) => {
      const need = l.qty.mul(dto.batchQty);
      const available = l.ingredient.stockQty;
      return {
        ingredientId: l.ingredientId,
        name: l.ingredient.name,
        baseUnit: l.ingredient.baseUnit,
        need: need.toDecimalPlaces(4).toNumber(),
        available: available.toDecimalPlaces(4).toNumber(),
        unitCost: l.ingredient.avgCostPerUnit.toDecimalPlaces(4).toNumber(),
        cost: need.mul(l.ingredient.avgCostPerUnit).toDecimalPlaces(2).toNumber(),
        short: need.gt(available),
      };
    });
    const expectedOutput = recipe.yieldQty.mul(dto.batchQty).toNumber();
    const estimatedCost = needs.reduce((sum, n) => sum + n.cost, 0);
    return {
      recipeId: recipe.id,
      recipeName: recipe.name,
      type: recipe.type,
      batchQty: dto.batchQty,
      expectedOutput,
      outputUnit: recipe.outputIngredient?.baseUnit ?? 'PCS',
      outputName: recipe.product?.name ?? recipe.outputIngredient?.name ?? recipe.name,
      needs,
      estimatedCost,
      costPerUnit: expectedOutput > 0 ? estimatedCost / expectedOutput : 0,
      canProduce: needs.every((n) => !n.short),
    };
  }

  /**
   * Satu transaksi: bahan berkurang (PRODUCTION_OUT, biaya rata-rata saat ini) → hasil bertambah
   * (PRODUCTION_IN) dengan biaya = total biaya aktual ÷ hasil aktual (rata-rata tertimbang).
   */
  async create(dto: CreateProductionDto, userId: string): Promise<ProductionView> {
    const id = await this.prisma.$transaction(async (tx) => {
      const recipe = await this.loadRecipe(tx, dto.recipeId);
      const isProduct = recipe.type === 'PRODUCT';
      if (isProduct && !Number.isInteger(dto.batchQty))
        throw new BadRequestException('Jumlah produksi produk harus bilangan bulat (pcs)');
      const expected = recipe.yieldQty.mul(dto.batchQty);
      const actual = D(dto.actualOutput ?? expected);
      if (isProduct && !actual.isInteger())
        throw new BadRequestException('Hasil aktual produk harus bilangan bulat (pcs)');

      const production = await tx.production.create({
        data: {
          type: recipe.type,
          recipeId: recipe.id,
          productId: recipe.productId,
          outputIngredientId: recipe.outputIngredientId,
          batchQty: dto.batchQty,
          expectedOutput: expected,
          actualOutput: actual,
          yieldVariance: actual.minus(expected),
          totalCost: 0,
          note: dto.note,
          createdById: userId,
        },
      });
      const meta = {
        userId,
        refType: 'PRODUCTION',
        refId: production.id,
        note: `Produksi ${recipe.name}`,
      };

      const used = await this.stock.apply(
        tx,
        recipe.lines.map((l) => ({
          itemType: 'INGREDIENT' as const,
          id: l.ingredientId,
          qty: l.qty.mul(dto.batchQty).neg(),
        })),
        { ...meta, type: 'PRODUCTION_OUT' },
      );
      const totalCost = used.reduce((sum, u) => sum.plus(u.qtyChange.abs().mul(u.unitCost)), D(0));

      await this.stock.apply(
        tx,
        [
          {
            itemType: isProduct ? 'PRODUCT' : 'INGREDIENT',
            id: (isProduct ? recipe.productId : recipe.outputIngredientId)!,
            qty: actual,
            unitCost: totalCost.div(actual),
          },
        ],
        { ...meta, type: 'PRODUCTION_IN' },
        { updateAverageCost: true },
      );

      await tx.production.update({
        where: { id: production.id },
        data: {
          totalCost: totalCost.toDecimalPlaces(4),
          lines: {
            create: used.map((u) => ({
              ingredientId: u.id,
              qtyUsed: u.qtyChange.abs(),
              unitCost: u.unitCost,
            })),
          },
        },
      });
      return production.id;
    });
    this.realtime.stockChanged();
    return toView(
      await this.prisma.production.findUniqueOrThrow({ where: { id }, include: productionInclude }),
    );
  }
}
