import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ProductView } from '@bekuin/shared';
import { rethrowPrismaError } from '../common/prisma-errors';
import { type CostGraph, packHpp, roundTo10 } from '../costing/cost-graph';
import { CostingService } from '../costing/costing.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateProductDto,
  CreateVariantDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './dto/menu.dto';

const productInclude = {
  recipe: { select: { id: true } },
  variants: {
    include: {
      category: true,
      _count: { select: { orderItems: true } },
      packaging: { include: { ingredient: { select: { name: true } } } },
    },
    orderBy: [{ category: { sortOrder: 'asc' } }, { packSize: 'asc' }],
  },
} satisfies Prisma.ProductInclude;

type ProductWithVariants = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

function toView(p: ProductWithVariants, graph: CostGraph): ProductView {
  const rawCost = graph.productCostPerPcs(p.id);
  const costPerPcs = rawCost === null ? null : roundTo10(rawCost);
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    stockPcs: p.stockPcs,
    minStockPcs: p.minStockPcs,
    isActive: p.isActive,
    isAvailable: p.isAvailable,
    sortOrder: p.sortOrder,
    costPerPcs,
    recipeId: p.recipe?.id ?? null,
    variants: p.variants.map((v) => {
      const packaging = v.packaging.map((pk) => ({
        ingredientId: pk.ingredientId,
        name: pk.ingredient.name,
        qty: pk.qty.toNumber(),
        unitCost: graph.unitCost(pk.ingredientId).toDecimalPlaces(4).toNumber(),
      }));
      const packagingCost = packaging.reduce((sum, pk) => sum + pk.qty * pk.unitCost, 0);
      const hppPerPack =
        costPerPcs === null ? null : packHpp(costPerPcs, v.packSize, packagingCost);
      return {
        id: v.id,
        productId: v.productId,
        categoryId: v.categoryId,
        categoryCode: v.category.code,
        categoryName: v.category.name,
        packSize: v.packSize,
        price: v.price,
        isActive: v.isActive,
        sortOrder: v.sortOrder,
        usedInOrders: v._count.orderItems > 0,
        packaging,
        hppPerPack,
        margin: hppPerPack === null ? null : v.price - hppPerPack,
        marginPct:
          hppPerPack === null ? null : Math.round(((v.price - hppPerPack) * 100) / v.price),
      };
    }),
  };
}

const VARIANT_CONFLICT = 'Varian dengan kategori dan ukuran pack itu sudah ada';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costing: CostingService,
  ) {}

  async list(includeInactive: boolean): Promise<ProductView[]> {
    const products = await this.prisma.product.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: productInclude,
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    const graph = await this.costing.graph();
    return products.map((p) => toView(p, graph));
  }

  async get(id: string): Promise<ProductView> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Produk tidak ditemukan');
    return toView(product, await this.costing.graph());
  }

  async create(dto: CreateProductDto): Promise<ProductView> {
    try {
      const product = await this.prisma.product.create({ data: dto, include: productInclude });
      return toView(product, await this.costing.graph());
    } catch (error) {
      rethrowPrismaError(error, 'Nama produk sudah dipakai');
    }
  }

  /** Stok tidak bisa diubah di sini; stok hanya lewat StockService (Sprint 2). */
  async update(id: string, dto: UpdateProductDto): Promise<ProductView> {
    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: dto,
        include: productInclude,
      });
      return toView(product, await this.costing.graph());
    } catch (error) {
      rethrowPrismaError(error, 'Nama produk sudah dipakai');
    }
  }

  async addVariant(productId: string, dto: CreateVariantDto): Promise<ProductView> {
    await this.ensureCategory(dto.categoryId);
    try {
      await this.prisma.productVariant.create({ data: { ...dto, productId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new NotFoundException('Produk tidak ditemukan');
      }
      rethrowPrismaError(error, VARIANT_CONFLICT);
    }
    return this.get(productId);
  }

  async updateVariant(
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ): Promise<ProductView> {
    const variant = await this.findVariant(productId, variantId);
    const changesIdentity =
      (dto.categoryId !== undefined && dto.categoryId !== variant.categoryId) ||
      (dto.packSize !== undefined && dto.packSize !== variant.packSize);
    if (changesIdentity && variant._count.orderItems > 0) {
      throw new BadRequestException(
        'Kategori/ukuran pack varian yang sudah pernah dipesan tidak bisa diubah. Nonaktifkan lalu buat varian baru.',
      );
    }
    if (dto.categoryId) await this.ensureCategory(dto.categoryId);
    try {
      await this.prisma.productVariant.update({ where: { id: variantId }, data: dto });
    } catch (error) {
      rethrowPrismaError(error, VARIANT_CONFLICT);
    }
    return this.get(productId);
  }

  /** Varian yang sudah dipakai order hanya dinonaktifkan; yang belum pernah dipakai dihapus. */
  async removeVariant(productId: string, variantId: string): Promise<ProductView> {
    const variant = await this.findVariant(productId, variantId);
    if (variant._count.orderItems > 0) {
      await this.prisma.productVariant.update({
        where: { id: variantId },
        data: { isActive: false },
      });
    } else {
      await this.prisma.productVariant.delete({ where: { id: variantId } });
    }
    return this.get(productId);
  }

  /** Ganti seluruh kemasan per pack satu varian (hanya bahan bertipe kemasan). */
  async setPackaging(
    productId: string,
    variantId: string,
    items: { ingredientId: string; qty: number }[],
  ): Promise<ProductView> {
    await this.findVariant(productId, variantId);
    const ids = items.map((i) => i.ingredientId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Kemasan yang sama muncul lebih dari sekali');
    const found = await this.prisma.ingredient.count({
      where: { id: { in: ids }, type: 'PACKAGING' },
    });
    if (found !== ids.length) throw new BadRequestException('Kemasan harus bahan bertipe Kemasan');
    await this.prisma.$transaction([
      this.prisma.variantPackaging.deleteMany({ where: { variantId } }),
      this.prisma.variantPackaging.createMany({ data: items.map((i) => ({ ...i, variantId })) }),
    ]);
    return this.get(productId);
  }

  private async findVariant(productId: string, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
      include: { _count: { select: { orderItems: true } } },
    });
    if (!variant) throw new NotFoundException('Varian tidak ditemukan');
    return variant;
  }

  private async ensureCategory(categoryId: string) {
    const exists = await this.prisma.salesCategory.count({ where: { id: categoryId } });
    if (!exists) throw new BadRequestException('Kategori tidak ditemukan');
  }
}
