import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateTableDto, UpdateTableDto } from './dto/table.dto';
import { TablesService } from './tables.service';

@ApiTags('Tables')
@ApiBearerAuth()
@Controller('tables')
export class TablesController {
  constructor(private readonly tables: TablesService) {}

  /** Staff: meja aktif tanpa token QR. Admin: semua + token. */
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.tables.list(user.role === 'ADMIN');
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateTableDto) {
    return this.tables.create(dto);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTableDto) {
    return this.tables.update(id, dto);
  }

  @Roles('ADMIN')
  @Post(':id/rotate-qr')
  @HttpCode(200)
  rotate(@Param('id') id: string) {
    return this.tables.rotate(id);
  }
}
