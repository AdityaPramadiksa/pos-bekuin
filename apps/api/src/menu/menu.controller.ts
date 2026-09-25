import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CatalogService } from './catalog.service';
import { CategoriesService } from './categories.service';
import {
  AvailabilityDto,
  CreateCategoryDto,
  CreateProductDto,
  CreateVariantDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './dto/menu.dto';
import { ProductsService } from './products.service';

@ApiTags('Menu')
@ApiBearerAuth()
@Controller()
export class MenuController {
  constructor(
    private readonly categories: CategoriesService,
    private readonly products: ProductsService,
    private readonly catalog: CatalogService,
  ) {}

  // ── Katalog POS (semua user login) ──

  @Get('catalog')
  getCatalog() {
    return this.catalog.get();
  }

  // ── Kategori ──

  @Get('sales-categories')
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  listCategories(
    @CurrentUser() user: JwtPayload,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    return this.categories.list(user.role === 'ADMIN' && !!includeInactive);
  }

  @Roles('ADMIN')
  @Post('sales-categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Roles('ADMIN')
  @Patch('sales-categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(id, dto);
  }

  // ── Produk & varian (admin) ──

  @Roles('ADMIN')
  @Get('products')
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  listProducts(
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    return this.products.list(!!includeInactive);
  }

  @Roles('ADMIN')
  @Get('products/:id')
  getProduct(@Param('id') id: string) {
    return this.products.get(id);
  }

  @Roles('ADMIN')
  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Roles('ADMIN')
  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  /** Soft delete: produk dinonaktifkan, riwayat order tetap utuh. */
  @Roles('ADMIN')
  @Delete('products/:id')
  deactivateProduct(@Param('id') id: string) {
    return this.products.update(id, { isActive: false });
  }

  @Roles('ADMIN')
  @Patch('products/:id/availability')
  setAvailability(@Param('id') id: string, @Body() dto: AvailabilityDto) {
    return this.products.update(id, { isAvailable: dto.isAvailable });
  }

  @Roles('ADMIN')
  @Post('products/:id/variants')
  addVariant(@Param('id') id: string, @Body() dto: CreateVariantDto) {
    return this.products.addVariant(id, dto);
  }

  @Roles('ADMIN')
  @Patch('products/:id/variants/:variantId')
  updateVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.products.updateVariant(id, variantId, dto);
  }

  @Roles('ADMIN')
  @Delete('products/:id/variants/:variantId')
  removeVariant(@Param('id') id: string, @Param('variantId') variantId: string) {
    return this.products.removeVariant(id, variantId);
  }
}
