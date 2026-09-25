import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateExpenseDto {
  @ApiProperty({ example: '2026-09-25' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Tanggal harus YYYY-MM-DD' })
  date: string;

  @ApiProperty() @IsString() categoryId: string;

  @ApiProperty({ example: 50000 })
  @IsInt({ message: 'Nominal harus angka rupiah' })
  @Min(1, { message: 'Nominal minimal Rp1' })
  @Max(1_000_000_000)
  amount: number;

  @ApiProperty({ description: 'Dibayar dari: metode bertipe CASH = uang laci' })
  @IsString()
  paymentMethodId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(200)
  note?: string | null;

  @ApiPropertyOptional({ example: '/uploads/receipt/2026-09/abc.webp' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\/uploads\/[\w./-]+$/, { message: 'URL foto nota tidak valid' })
  photoUrl?: string | null;
}

export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}

export class CreateExpenseCategoryDto {
  @ApiProperty({ example: 'Kemasan tambahan' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateExpenseCategoryDto extends PartialType(CreateExpenseCategoryDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
