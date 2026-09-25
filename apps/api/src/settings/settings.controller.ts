import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('Settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Semua user login boleh membaca (nama toko untuk struk, dll). */
  @Get()
  get() {
    return this.settings.get();
  }

  @Roles('ADMIN')
  @Patch()
  update(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }

  /** Ganti link order online (bila disebar ke tempat yang salah / disalahgunakan). */
  @Roles('ADMIN')
  @Post('online-link/rotate')
  @HttpCode(200)
  rotateOnlineLink() {
    return this.settings.rotateOnlineLink();
  }
}
