import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateOpnameDto, UpdateOpnameDto } from './dto/opname.dto';
import { OpnamesService } from './opnames.service';

@ApiTags('Stock Opname')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('opnames')
export class OpnamesController {
  constructor(private readonly opnames: OpnamesService) {}

  @Get()
  list() {
    return this.opnames.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.opnames.get(id);
  }

  @Post()
  create(@Body() dto: CreateOpnameDto, @CurrentUser() user: JwtPayload) {
    return this.opnames.create(dto, user.sub);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOpnameDto) {
    return this.opnames.update(id, dto);
  }

  @Post(':id/finalize')
  @HttpCode(200)
  finalize(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.opnames.finalize(id, user.sub);
  }

  /** Hanya draft yang bisa dihapus. */
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.opnames.remove(id);
  }
}
