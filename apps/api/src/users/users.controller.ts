import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type JwtPayload } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  /** Tidak ada hapus permanen: nonaktifkan lewat isActive = false. */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: JwtPayload) {
    return this.users.update(id, dto, actor.sub);
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    await this.users.resetPassword(id, dto.password);
  }
}
