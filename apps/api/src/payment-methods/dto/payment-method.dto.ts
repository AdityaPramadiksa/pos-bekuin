import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PaymentType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePaymentMethodDto {
  @ApiProperty({ example: 'Transfer BCA' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name: string;

  @ApiProperty({ enum: PaymentType })
  @IsEnum(PaymentType)
  type: PaymentType;

  @ApiPropertyOptional({ example: 'BCA 1234567890 a.n. Bekuin' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountInfo?: string | null;

  @ApiPropertyOptional({ description: 'Tampil sebagai pilihan bayar di self-order QR' })
  @IsOptional()
  @IsBoolean()
  showToCustomer?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdatePaymentMethodDto extends PartialType(CreatePaymentMethodDto) {}
