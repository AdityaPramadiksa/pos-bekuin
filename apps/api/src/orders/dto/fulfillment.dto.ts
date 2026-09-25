import { ApiProperty } from '@nestjs/swagger';
import { FulfillmentStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class FulfillmentDto {
  @ApiProperty({ enum: FulfillmentStatus }) @IsEnum(FulfillmentStatus) status: FulfillmentStatus;
}
