import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class PublicOrderItemDto {
  @ApiProperty() @IsString() @MaxLength(40) variantId: string;
  @ApiProperty({ minimum: 1, maximum: 50 }) @IsInt() @Min(1) @Max(50) qty: number;
}

export class CreatePublicOrderDto {
  @ApiProperty() @IsString() @MaxLength(32) qrToken: string;

  @ApiProperty({ type: [PublicOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Keranjang masih kosong' })
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PublicOrderItemDto)
  items: PublicOrderItemDto[];

  @ApiProperty({ description: 'Nama untuk dipanggil' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Isi nama minimal 2 huruf' })
  @MaxLength(40)
  customerName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @Matches(/^[0-9+\-\s]{8,20}$/, { message: 'Nomor WA tidak valid' })
  customerPhone?: string | null;

  @ApiProperty({ enum: ['DINE_IN', 'TAKEAWAY'] }) @IsIn(['DINE_IN', 'TAKEAWAY']) type:
    'DINE_IN' | 'TAKEAWAY';

  @ApiPropertyOptional() @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(150) note?:
    string | null;

  @ApiProperty({ description: 'Metode bayar pilihan pelanggan (yang tampil di QR pelanggan)' })
  @IsString({ message: 'Pilih cara bayar' })
  @MaxLength(40)
  paymentMethodId: string;
}
