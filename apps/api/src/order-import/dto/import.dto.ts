import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class ImportPreviewDto {
  @ApiProperty({ description: 'Teks pesan WhatsApp apa adanya' })
  @IsString()
  @MaxLength(20_000)
  text: string;
  @ApiPropertyOptional({ description: 'Tanggal kirim bila pesan tidak menyebut besok/lusa' })
  @IsOptional()
  @Matches(DATE_KEY)
  deliveryDate?: string;
}

export class ImportItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() @Min(1) @Max(200) qty: number;
}

export class ImportCustomerDto {
  @ApiProperty({ description: 'Boleh kosong (order tanpa nama)' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(60)
  name: string;

  @ApiProperty({ type: [ImportItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ImportItemDto)
  items: ImportItemDto[];
}

export class ImportSaveDto {
  @ApiProperty() @IsString() @MaxLength(20_000) rawText: string;
  @ApiProperty()
  @Matches(DATE_KEY, { message: 'Tanggal kirim harus YYYY-MM-DD' })
  deliveryDate: string;

  @ApiProperty({ type: [ImportCustomerDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Belum ada pesanan untuk disimpan' })
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportCustomerDto)
  customers: ImportCustomerDto[];
}
