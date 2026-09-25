import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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

export class AdjustStockDto {
  @ApiProperty({ enum: ['PRODUCT', 'INGREDIENT'] })
  @IsIn(['PRODUCT', 'INGREDIENT'])
  itemType: 'PRODUCT' | 'INGREDIENT';

  @ApiProperty() @IsString() itemId: string;

  @ApiProperty({
    enum: ['ADD', 'SUBTRACT', 'SET'],
    description: 'Tambah, kurangi, atau set ke angka pasti',
  })
  @IsIn(['ADD', 'SUBTRACT', 'SET'])
  mode: 'ADD' | 'SUBTRACT' | 'SET';

  @ApiProperty({ description: 'Jumlah (pcs untuk produk, satuan dasar untuk bahan)' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(10_000_000)
  qty: number;

  @ApiProperty({ enum: ['MANUAL_ADJUST', 'WASTE'] })
  @IsIn(['MANUAL_ADJUST', 'WASTE'])
  reason: 'MANUAL_ADJUST' | 'WASTE';

  @ApiProperty({ description: 'Alasan wajib diisi', example: 'Stok awal' })
  @IsString()
  @MinLength(3, { message: 'Alasan minimal 3 karakter' })
  @MaxLength(200)
  note: string;
}

export class MovementQueryDto {
  @ApiPropertyOptional({ enum: ['PRODUCT', 'INGREDIENT'] })
  @IsOptional()
  @IsIn(['PRODUCT', 'INGREDIENT'])
  itemType?: 'PRODUCT' | 'INGREDIENT';

  @ApiPropertyOptional() @IsOptional() @IsString() itemId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional({ description: 'YYYY-MM-DD (WITA)' })
  @IsOptional()
  @IsString()
  from?: string;
  @ApiPropertyOptional({ description: 'YYYY-MM-DD (WITA)' }) @IsOptional() @IsString() to?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
