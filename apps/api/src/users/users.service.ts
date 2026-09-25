import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { UserView } from '@bekuin/shared';
import * as bcrypt from 'bcryptjs';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateUserDto, UpdateUserDto } from './dto/user.dto';

function toView(user: User): UserView {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<UserView[]> {
    const users = await this.prisma.user.findMany({
      orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
    });
    return users.map(toView);
  }

  async create(dto: CreateUserDto): Promise<UserView> {
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          username: dto.username,
          role: dto.role,
          passwordHash: await bcrypt.hash(dto.password, 10),
          mustChangePassword: true,
        },
      });
      return toView(user);
    } catch (error) {
      rethrowPrismaError(error, 'Username sudah dipakai');
    }
  }

  async update(id: string, dto: UpdateUserDto, actorId: string): Promise<UserView> {
    const user = await this.findOrThrow(id);
    const losesAdmin =
      user.role === 'ADMIN' && user.isActive && (dto.role === 'STAFF' || dto.isActive === false);

    if (id === actorId && losesAdmin) {
      throw new BadRequestException('Tidak bisa menonaktifkan atau menurunkan role akun sendiri');
    }
    if (losesAdmin) {
      const activeAdmins = await this.prisma.user.count({
        where: { role: 'ADMIN', isActive: true },
      });
      if (activeAdmins <= 1) throw new BadRequestException('Minimal harus ada satu admin aktif');
    }

    const updated = await this.prisma.user.update({ where: { id }, data: dto });
    if (dto.isActive === false) await this.revokeSessions(id);
    return toView(updated);
  }

  /** Admin mengatur password sementara; user wajib menggantinya saat login berikutnya. */
  async resetPassword(id: string, password: string): Promise<void> {
    await this.findOrThrow(id);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 10), mustChangePassword: true },
    });
    await this.revokeSessions(id);
  }

  private async findOrThrow(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Pengguna tidak ditemukan');
    return user;
  }

  private revokeSessions(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
