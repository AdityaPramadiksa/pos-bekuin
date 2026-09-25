import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseUnit } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class RecipeLineDto {
  @ApiProperty() @IsString() ingredientId: string;
  @ApiProperty({ description: 'Jumlah dalam satuan dasar bahan' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  qty: number;
}

export class CreateRecipeDto {
  @ApiProperty({ enum: ['SEMI_FINISHED', 'PRODUCT'] }) @IsIn(['SEMI_FINISHED', 'PRODUCT']) type:
    'SEMI_FINISHED' | 'PRODUCT';

  @ApiPropertyOptional({
    description: 'Wajib untuk setengah jadi (jadi nama bahan hasil)',
    example: 'Adonan Dasar',
  })
  @ValidateIf((o: CreateRecipeDto) => o.type === 'SEMI_FINISHED')
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ description: 'Setengah jadi: hasil per batch (misal 1200 g)' })
  @ValidateIf((o: CreateRecipeDto) => o.type === 'SEMI_FINISHED')
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  yieldQty?: number;

  @ApiPropertyOptional({ enum: BaseUnit, description: 'Setengah jadi: satuan hasil' })
  @ValidateIf((o: CreateRecipeDto) => o.type === 'SEMI_FINISHED')
  @IsEnum(BaseUnit)
  yieldUnit?: BaseUnit;

  @ApiPropertyOptional({ description: 'Resep produk: komposisi per 1 pcs' })
  @ValidateIf((o: CreateRecipeDto) => o.type === 'PRODUCT')
  @IsString()
  productId?: string;

  @ApiProperty({ type: [RecipeLineDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Resep minimal 1 bahan' })
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  lines: RecipeLineDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string | null;
}

export class UpdateRecipeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  yieldQty?: number;

  @ApiPropertyOptional({ type: [RecipeLineDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Resep minimal 1 bahan' })
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  lines?: RecipeLineDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) note?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
