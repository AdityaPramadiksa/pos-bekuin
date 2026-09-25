import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class PurchaseItemDto {
  @ApiProperty() @IsString() ingredientId: string;

  @ApiProperty({ example: 2, description: 'Jumlah kemasan beli (misal 2 pack)' })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(100_000)
  packQty: number;

  @ApiProperty({ example: 280000, description: 'Total harga baris (rupiah)' })
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  totalPrice: number;
}

export class CreatePurchaseDto {
  @ApiProperty({ example: '2026-09-25' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Tanggal harus YYYY-MM-DD' })
  date: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(60) supplier?:
    string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(200) note?:
    string | null;

  @ApiPropertyOptional({ example: '/uploads/receipt/2026-09/abc.webp' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\/uploads\/[\w./-]+$/, { message: 'URL foto nota tidak valid' })
  photoUrl?: string | null;

  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Minimal 1 bahan' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];
}
