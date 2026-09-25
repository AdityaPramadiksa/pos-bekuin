import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUserDto {
  @ApiProperty({ example: 'Rina' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;

  @ApiProperty({ example: 'rina' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z0-9._]{3,30}$/, {
    message: 'Username 3–30 karakter: huruf kecil, angka, titik, atau garis bawah',
  })
  username: string;

  @ApiProperty({
    minLength: 8,
    description: 'Password awal; user wajib menggantinya saat login pertama',
  })
  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  password: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;
}

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResetPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  password: string;
}
