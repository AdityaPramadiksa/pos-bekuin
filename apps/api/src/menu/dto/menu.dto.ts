import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  ValidateNested,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

// ── Kategori penjualan ──

export class CreateCategoryDto {
  @ApiProperty({ example: 'MINUMAN', description: 'Kode unik huruf besar, tidak bisa diubah' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z][A-Z0-9_]{1,29}$/, {
    message: 'Kode: huruf besar/angka/garis bawah, 2–30 karakter',
  })
  code: string;

  @ApiProperty({ example: 'Minuman' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCustomerVisible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateCategoryDto extends PartialType(
  OmitType(CreateCategoryDto, ['code'] as const),
) {}

// ── Produk ──

export class CreateProductDto {
  @ApiProperty({ example: 'Udang Keju' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiPropertyOptional({ example: 'Dimsum ayam isi udang dengan keju leleh' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @ApiPropertyOptional({ example: '/uploads/menu/2026-09/abc.webp' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\/uploads\/[\w./-]+$/, { message: 'URL foto tidak valid' })
  imageUrl?: string | null;

  @ApiPropertyOptional({ description: 'Batas stok menipis (pcs)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  minStockPcs?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiPropertyOptional({ description: 'false = nonaktif (soft delete)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'false = tandai Habis' })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class AvailabilityDto {
  @ApiProperty() @IsBoolean() isAvailable: boolean;
}

// ── Varian ──

export class CreateVariantDto {
  @ApiProperty() @IsString() categoryId: string;

  @ApiProperty({ example: 6, description: 'Isi per pack (pcs)' })
  @IsInt()
  @Min(1)
  @Max(100)
  packSize: number;

  @ApiProperty({ example: 22000, description: 'Harga jual per pack (rupiah)' })
  @IsInt({ message: 'Harga harus bilangan bulat rupiah' })
  @Min(1, { message: 'Harga harus lebih dari 0' })
  @Max(100_000_000)
  price: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateVariantDto extends PartialType(CreateVariantDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class PackagingItemDto {
  @ApiProperty() @IsString() ingredientId: string;
  @ApiProperty({ example: 1, description: 'Jumlah per pack' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  qty: number;
}

export class SetPackagingDto {
  @ApiProperty({ type: [PackagingItemDto] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PackagingItemDto)
  items: PackagingItemDto[];
}
