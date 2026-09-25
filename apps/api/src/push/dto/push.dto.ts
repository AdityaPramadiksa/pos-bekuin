import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';

class PushKeysDto {
  @ApiProperty() @IsString() @MaxLength(200) p256dh: string;
  @ApiProperty() @IsString() @MaxLength(100) auth: string;
}

/** Bentuk PushSubscription.toJSON() dari browser. */
export class SubscribePushDto {
  @ApiProperty()
  @IsUrl({ protocols: ['https'], require_tld: false }, { message: 'Endpoint push tidak valid' })
  @MaxLength(1000)
  endpoint: string;

  @ApiProperty({ type: PushKeysDto })
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

export class UnsubscribePushDto {
  @ApiProperty() @IsString() @MaxLength(1000) endpoint: string;
}
