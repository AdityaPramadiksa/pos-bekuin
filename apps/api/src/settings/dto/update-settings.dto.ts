import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

const UPLOAD_URL = /^\/uploads\/[\w./-]+$/;

export class UpdateSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(40) storeName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) tagline?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) address?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) phone?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) receiptFooter?: string | null;

  @ApiPropertyOptional({ example: '/uploads/qris/2026-09/abc.png' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(UPLOAD_URL, { message: 'URL gambar QRIS tidak valid' })
  qrisImageUrl?: string | null;

  @ApiPropertyOptional({ description: 'Teks QRIS statis (hasil baca gambar QRIS toko)' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(512)
  qrisPayload?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(UPLOAD_URL, { message: 'URL logo tidak valid' })
  logoUrl?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isStoreOpen?: boolean;

  @ApiPropertyOptional({ example: { mon: ['09:00', '21:00'], sun: null } })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  openingHours?: Record<string, [string, string] | null> | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() qrOrderingEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(10_000)
  @Max(100_000_000)
  qrMaxOrderTotal?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() blockApproveOnLowStock?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(24) @Max(48) paperWidthChars?: number;
}
