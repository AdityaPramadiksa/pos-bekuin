import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
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
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export class OrderItemInputDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty({ minimum: 1, maximum: 200 }) @IsInt() @Min(1) @Max(200) qty: number;
  @ApiPropertyOptional() @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(100) note?:
    string | null;
}

export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Order minimal berisi 1 item' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items: OrderItemInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(60)
  customerName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @Matches(/^[0-9+\-\s]{8,20}$/, { message: 'Nomor WA tidak valid' })
  customerPhone?: string | null;

  @ApiPropertyOptional() @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(200) note?:
    string | null;

  @ApiPropertyOptional({ enum: OrderType }) @IsOptional() @IsEnum(OrderType) type?: OrderType;
  @ApiPropertyOptional() @IsOptional() @IsString() tableId?: string | null;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD (WITA), default hari ini' })
  @IsOptional()
  @Matches(DATE_KEY, { message: 'Tanggal kirim harus YYYY-MM-DD' })
  deliveryDate?: string;
}

export class UpdateOrderDto {
  @ApiPropertyOptional({ type: [OrderItemInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Order minimal berisi 1 item' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  items?: OrderItemInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(60)
  customerName?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @Matches(/^[0-9+\-\s]{8,20}$/, { message: 'Nomor WA tidak valid' })
  customerPhone?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(trimOrNull) @IsString() @MaxLength(200) note?:
    string | null;
  @ApiPropertyOptional({ enum: OrderType }) @IsOptional() @IsEnum(OrderType) type?: OrderType;
  @ApiPropertyOptional() @IsOptional() @IsString() tableId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_KEY) deliveryDate?: string;
}

export class ApproveItemDto {
  @ApiProperty() @IsString() id: string;
  @ApiProperty({ description: '0 = hapus item' }) @IsInt() @Min(0) @Max(200) qty: number;
}

export class ApproveOrderDto {
  @ApiPropertyOptional({ description: 'Kosong = pakai cara bayar pilihan pelanggan (order QR)' })
  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @ApiPropertyOptional({ description: 'Wajib untuk Cash: uang diterima (rupiah)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  paidAmount?: number;

  @ApiPropertyOptional({ description: 'Diskon rupiah (persen dihitung di aplikasi)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(60)
  paymentRef?: string | null;

  @ApiPropertyOptional({ type: [ApproveItemDto], description: 'Koreksi qty sebelum approve' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApproveItemDto)
  items?: ApproveItemDto[];
}

export class ReasonDto {
  @ApiProperty()
  @IsString()
  @MinLength(3, { message: 'Alasan minimal 3 karakter' })
  @MaxLength(200)
  reason: string;
}

export class OptionalReasonDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

export class ListOrdersDto {
  @ApiPropertyOptional({ description: 'Pisahkan dengan koma: PENDING,PAID' })
  @IsOptional()
  @IsString()
  status?: string;
  @ApiPropertyOptional({ description: 'POS,ADMIN,QR_TABLE,WA_IMPORT,ONLINE' })
  @IsOptional()
  @IsString()
  source?: string;
  @ApiPropertyOptional({ enum: ['created', 'delivery', 'approved'] })
  @IsOptional()
  @IsIn(['created', 'delivery', 'approved'])
  dateField?: 'created' | 'delivery' | 'approved';
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_KEY) from?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(DATE_KEY) to?: string;
  @ApiPropertyOptional({ description: 'Cari nomor order / nama pelanggan' })
  @IsOptional()
  @IsString()
  q?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() createdById?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentMethodId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fulfillment?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  mine?: boolean;
  @ApiPropertyOptional({ enum: ['newest', 'oldest'] })
  @IsOptional()
  @IsIn(['newest', 'oldest'])
  sort?: 'newest' | 'oldest';
  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class BulkApproveDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  orderIds: string[];

  @ApiProperty() @IsString() paymentMethodId: string;
}
