import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseUnit } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateIngredientDto {
  @ApiProperty({ example: 'Keju oles' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiProperty({
    enum: ['RAW', 'PACKAGING'],
    description: 'Bahan setengah jadi dibuat lewat resep',
  })
  @IsIn(['RAW', 'PACKAGING'])
  type: 'RAW' | 'PACKAGING';

  @ApiProperty({ enum: BaseUnit }) @IsEnum(BaseUnit) baseUnit: BaseUnit;

  @ApiPropertyOptional({ example: 'pack 2 kg' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(40)
  purchaseUnit?: string | null;

  @ApiProperty({ example: 2000, description: 'Isi per kemasan beli (satuan dasar)' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(10_000_000)
  purchaseQty: number;

  @ApiProperty({ example: 140000, description: 'Harga per kemasan beli (rupiah)' })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  lastPrice: number;

  @ApiPropertyOptional({ description: 'Batas stok menipis (satuan dasar)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  minStock?: number;
}

export class UpdateIngredientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(40)
  purchaseUnit?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  purchaseQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) lastPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) minStock?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
