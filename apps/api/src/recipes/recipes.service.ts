import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { RecipeView } from '@bekuin/shared';
import { rethrowPrismaError } from '../common/prisma-errors';
import { CostGraph, type CostRecipe } from '../costing/cost-graph';
import { CostingService } from '../costing/costing.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateRecipeDto, RecipeLineDto, UpdateRecipeDto } from './dto/recipe.dto';

const include = {
  lines: { include: { ingredient: { select: { name: true, baseUnit: true } } } },
  product: { select: { name: true } },
  outputIngredient: { select: { baseUnit: true } },
} satisfies Prisma.RecipeInclude;
type RecipeRow = Prisma.RecipeGetPayload<{ include: typeof include }>;

const toCostRecipe = (r: RecipeRow): CostRecipe => ({
  id: r.id,
  name: r.name,
  type: r.type,
  yieldQty: r.yieldQty,
  outputIngredientId: r.outputIngredientId,
  productId: r.productId,
  lines: r.lines.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty })),
});

function toView(r: RecipeRow, graph: CostGraph): RecipeView {
  const cost = graph.breakdown(toCostRecipe(r));
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    yieldQty: r.yieldQty.toNumber(),
    yieldUnit: r.outputIngredient?.baseUnit ?? 'PCS',
    outputIngredientId: r.outputIngredientId,
    productId: r.productId,
    productName: r.product?.name ?? null,
    note: r.note,
    isActive: r.isActive,
    lines: r.lines.map((l, idx) => ({
      ingredientId: l.ingredientId,
      name: l.ingredient.name,
      baseUnit: l.ingredient.baseUnit,
      qty: l.qty.toNumber(),
      unitCost: cost.lines[idx].unitCost,
      cost: cost.lines[idx].cost,
    })),
    totalCost: cost.total,
    costPerUnit: cost.perUnit,
  };
}

@Injectable()
export class RecipesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
  ) {}

  async list(): Promise<RecipeView[]> {
    const [rows, graph] = await Promise.all([
      this.prisma.recipe.findMany({ include, orderBy: [{ type: 'desc' }, { name: 'asc' }] }),
      this.costing.graph(),
    ]);
    return rows.map((r) => toView(r, graph));
  }

  async get(id: string): Promise<RecipeView> {
    const row = await this.prisma.recipe.findUnique({ where: { id }, include });
    if (!row) throw new NotFoundException('Resep tidak ditemukan');
    return toView(row, await this.costing.graph());
  }

  async create(dto: CreateRecipeDto): Promise<RecipeView> {
    const id = await this.prisma.$transaction(async (tx) => {
      this.assertUniqueLines(dto.lines);
      let data: {
        name: string;
        type: 'SEMI_FINISHED' | 'PRODUCT';
        yieldQty: number;
        outputIngredientId?: string;
        productId?: string;
        note?: string | null;
      };
      if (dto.type === 'SEMI_FINISHED') {
        const output = await tx.ingredient
          .create({
            data: {
              name: dto.name!,
              type: 'SEMI_FINISHED',
              baseUnit: dto.yieldUnit!,
              purchaseQty: dto.yieldQty!,
            },
          })
          .catch((error) => rethrowPrismaError(error, 'Nama bahan hasil sudah dipakai'));
        data = {
          name: dto.name!,
          type: 'SEMI_FINISHED',
          yieldQty: dto.yieldQty!,
          outputIngredientId: output.id,
          note: dto.note,
        };
      } else {
        const product = await tx.product.findUnique({
          where: { id: dto.productId! },
          include: { recipe: true },
        });
        if (!product) throw new BadRequestException('Produk tidak ditemukan');
        if (product.recipe)
          throw new BadRequestException('Produk ini sudah punya resep. Edit resep yang ada.');
        data = {
          name: `Resep ${product.name}`,
          type: 'PRODUCT',
          yieldQty: 1,
          productId: product.id,
          note: dto.note,
        };
      }
      await this.assertValid(tx, { ...data, id: 'new', lines: dto.lines });
      const recipe = await tx.recipe.create({ data: { ...data, lines: { create: dto.lines } } });
      return recipe.id;
    });
    return this.get(id);
  }

  async update(id: string, dto: UpdateRecipeDto): Promise<RecipeView> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.recipe.findUnique({ where: { id }, include: { lines: true } });
      if (!current) throw new NotFoundException('Resep tidak ditemukan');
      if (current.type === 'PRODUCT' && dto.yieldQty !== undefined && dto.yieldQty !== 1) {
        throw new BadRequestException('Resep produk selalu per 1 pcs');
      }
      if (dto.lines) this.assertUniqueLines(dto.lines);
      const lines =
        dto.lines ??
        current.lines.map((l) => ({ ingredientId: l.ingredientId, qty: l.qty.toNumber() }));
      await this.assertValid(tx, { ...current, yieldQty: dto.yieldQty ?? current.yieldQty, lines });

      await tx.recipe.update({
        where: { id },
        data: { name: dto.name, yieldQty: dto.yieldQty, note: dto.note, isActive: dto.isActive },
      });
      if (dto.name && current.outputIngredientId) {
        await tx.ingredient
          .update({
            where: { id: current.outputIngredientId },
            data: { name: dto.name, purchaseQty: dto.yieldQty },
          })
          .catch((error) => rethrowPrismaError(error, 'Nama bahan hasil sudah dipakai'));
      } else if (dto.yieldQty && current.outputIngredientId) {
        await tx.ingredient.update({
          where: { id: current.outputIngredientId },
          data: { purchaseQty: dto.yieldQty },
        });
      }
      if (dto.lines) {
        await tx.recipeLine.deleteMany({ where: { recipeId: id } });
        await tx.recipeLine.createMany({ data: dto.lines.map((l) => ({ ...l, recipeId: id })) });
      }
    });
    return this.get(id);
  }

  private assertUniqueLines(lines: RecipeLineDto[]) {
    const ids = lines.map((l) => l.ingredientId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Bahan yang sama muncul lebih dari sekali');
  }

  /** Bahan harus ada & bukan hasil resep itu sendiri; tidak boleh melingkar. */
  private async assertValid(
    tx: Prisma.TransactionClient,
    recipe: {
      id: string;
      name: string;
      type: 'SEMI_FINISHED' | 'PRODUCT';
      yieldQty: Prisma.Decimal.Value;
      outputIngredientId?: string | null;
      productId?: string | null;
      lines: { ingredientId: string; qty: Prisma.Decimal.Value }[];
    },
  ) {
    const found = await tx.ingredient.findMany({
      where: { id: { in: recipe.lines.map((l) => l.ingredientId) } },
      select: { id: true, type: true },
    });
    if (found.length !== recipe.lines.length)
      throw new BadRequestException('Ada bahan yang tidak ditemukan');
    if (recipe.lines.some((l) => l.ingredientId === recipe.outputIngredientId)) {
      throw new BadRequestException('Resep tidak boleh memakai hasilnya sendiri');
    }
    if (recipe.type === 'PRODUCT' && found.some((f) => f.type === 'PACKAGING')) {
      throw new BadRequestException(
        'Bahan kemasan diatur di varian (per pack), bukan di resep produk',
      );
    }
    CostGraph.assertNoCycle(
      await this.costing.loadIngredients(tx),
      await this.costing.loadRecipes(tx),
      {
        id: recipe.id,
        name: recipe.name,
        type: recipe.type,
        yieldQty: recipe.yieldQty,
        outputIngredientId: recipe.outputIngredientId ?? null,
        productId: recipe.productId ?? null,
        lines: recipe.lines,
      },
    );
  }
}
