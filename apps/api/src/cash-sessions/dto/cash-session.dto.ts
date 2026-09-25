import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class OpenCashSessionDto {
  @ApiProperty({ example: 200000, description: 'Modal awal di laci (rupiah)' })
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  openingCash: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class CloseCashSessionDto {
  @ApiProperty({ example: 615000, description: 'Uang fisik hasil hitung (rupiah)' })
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  countedCash: number;

  @ApiPropertyOptional({ description: 'Wajib diisi bila ada selisih' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(300)
  note?: string | null;
}
