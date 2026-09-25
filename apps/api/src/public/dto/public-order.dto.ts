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
  ValidateIf,
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

/** Pesanan lewat link order online toko (tanpa meja). */
export class CreateOnlineOrderDto {
  @ApiProperty({ description: 'Token link order online (/pesan/<token>)' })
  @IsString()
  @MaxLength(32)
  onlineToken: string;

  @ApiProperty({ type: [PublicOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Keranjang masih kosong' })
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PublicOrderItemDto)
  items: PublicOrderItemDto[];

  @ApiProperty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'Isi nama minimal 2 huruf' })
  @MaxLength(40)
  customerName: string;

  @ApiProperty({ description: 'Wajib: untuk konfirmasi & pengantaran' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^[0-9+\-\s]{8,20}$/, { message: 'Nomor WhatsApp tidak valid' })
  customerPhone: string;

  @ApiProperty({ enum: ['PICKUP', 'DELIVERY'] })
  @IsIn(['PICKUP', 'DELIVERY'], { message: 'Pilih ambil sendiri atau diantar' })
  deliveryMethod: 'PICKUP' | 'DELIVERY';

  @ApiPropertyOptional({ description: 'Wajib bila diantar' })
  @ValidateIf((o: CreateOnlineOrderDto) => o.deliveryMethod === 'DELIVERY')
  @Transform(trimOrNull)
  @IsString({ message: 'Isi alamat pengantaran' })
  @MinLength(10, { message: 'Alamat terlalu singkat, tambahkan patokan' })
  @MaxLength(300)
  deliveryAddress?: string | null;

  @ApiProperty({ example: '2026-09-26', description: 'Tanggal kirim/ambil (WITA)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Pilih tanggal kirim' })
  deliveryDate: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(150) note?:
    string | null;

  @ApiProperty()
  @IsString({ message: 'Pilih cara bayar' })
  @MaxLength(40)
  paymentMethodId: string;
}
