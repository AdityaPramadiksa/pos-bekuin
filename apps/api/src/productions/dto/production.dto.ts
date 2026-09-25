import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ProductionPreviewDto {
  @ApiProperty() @IsString() recipeId: string;

  @ApiProperty({ description: 'Setengah jadi: jumlah batch. Produk: jumlah pcs.', example: 60 })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(100_000)
  batchQty: number;
}

export class CreateProductionDto extends ProductionPreviewDto {
  @ApiPropertyOptional({
    description: 'Hasil aktual (default = hasil teori). Selisih dicatat sebagai yield variance.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  actualOutput?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) note?: string;
}
