import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class CreateOpnameDto {
  @ApiProperty({ enum: ['PRODUCT', 'INGREDIENT', 'ALL'] })
  @IsIn(['PRODUCT', 'INGREDIENT', 'ALL'])
  scope: 'PRODUCT' | 'INGREDIENT' | 'ALL';
  @ApiPropertyOptional({ enum: ['RAW', 'SEMI_FINISHED', 'PACKAGING'] })
  @IsOptional()
  @IsIn(['RAW', 'SEMI_FINISHED', 'PACKAGING'])
  ingredientType?: 'RAW' | 'SEMI_FINISHED' | 'PACKAGING';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class OpnameCountDto {
  @ApiProperty() @IsString() id: string;
  @ApiProperty({ nullable: true, description: 'Stok fisik; null = belum dihitung' })
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  physicalQty: number | null;
}

export class UpdateOpnameDto {
  @ApiProperty({ type: [OpnameCountDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => OpnameCountDto)
  items: OpnameCountDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) note?: string;
}
