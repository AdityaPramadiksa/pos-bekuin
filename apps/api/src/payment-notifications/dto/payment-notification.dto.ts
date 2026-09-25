import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Isi yang dikirim MacroDroid (HTTP Request, body JSON) saat notifikasi DANA muncul. */
export class PaymentNotificationDto {
  @ApiProperty({ description: 'Isi notifikasi, mis. "Kamu menerima Rp25.037 dari ..."' })
  @IsString()
  @MaxLength(1000)
  text: string;

  @ApiPropertyOptional({ description: 'Judul notifikasi' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Nama aplikasi, mis. DANA' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  app?: string;
}

export class TestNotificationDto {
  @ApiProperty() @IsString() @MaxLength(1000) text: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
}
