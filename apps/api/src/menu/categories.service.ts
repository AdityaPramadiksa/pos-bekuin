import { Injectable } from '@nestjs/common';
import type { SalesCategoryView } from '@bekuin/shared';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/menu.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive: boolean): Promise<SalesCategoryView[]> {
    return this.prisma.salesCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateCategoryDto): Promise<SalesCategoryView> {
    try {
      return await this.prisma.salesCategory.create({ data: dto });
    } catch (error) {
      rethrowPrismaError(error, 'Kode kategori sudah dipakai');
    }
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<SalesCategoryView> {
    try {
      return await this.prisma.salesCategory.update({ where: { id }, data: dto });
    } catch (error) {
      rethrowPrismaError(error);
    }
  }
}
