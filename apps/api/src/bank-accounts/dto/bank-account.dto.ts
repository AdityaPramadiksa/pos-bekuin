import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateBankAccountDto {
  @ApiProperty({ example: 'BCA' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Nama bank minimal 2 karakter' })
  @MaxLength(40)
  bankName: string;

  @ApiProperty({ example: '1234567890' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value))
  @IsString()
  @Matches(/^\d{5,25}$/, { message: 'Nomor rekening hanya angka (5–25 digit)' })
  accountNumber: string;

  @ApiProperty({ example: 'Komang Aditya' })
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Nama pemilik rekening minimal 2 karakter' })
  @MaxLength(80)
  accountName: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateBankAccountDto extends PartialType(CreateBankAccountDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
