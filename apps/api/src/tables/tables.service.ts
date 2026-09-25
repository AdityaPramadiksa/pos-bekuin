import { Injectable } from '@nestjs/common';
import type { DiningTable } from '@prisma/client';
import type { TableView } from '@bekuin/shared';
import { randomBytes } from 'node:crypto';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateTableDto, UpdateTableDto } from './dto/table.dto';

/** 12 karakter acak, tidak bisa ditebak dari nomor meja. */
export const newQrToken = () => randomBytes(9).toString('base64url');

const toView = (t: DiningTable, isAdmin: boolean): TableView => ({
  id: t.id,
  code: t.code,
  name: t.name,
  qrToken: isAdmin ? t.qrToken : null,
  isActive: t.isActive,
  sortOrder: t.sortOrder,
});

@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(isAdmin: boolean): Promise<TableView[]> {
    const tables = await this.prisma.diningTable.findMany({
      where: isAdmin ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
    return tables.map((t) => toView(t, isAdmin));
  }

  async create(dto: CreateTableDto): Promise<TableView> {
    try {
      return toView(
        await this.prisma.diningTable.create({ data: { ...dto, qrToken: newQrToken() } }),
        true,
      );
    } catch (error) {
      rethrowPrismaError(error, 'Kode meja sudah dipakai');
    }
  }

  async update(id: string, dto: UpdateTableDto): Promise<TableView> {
    try {
      return toView(await this.prisma.diningTable.update({ where: { id }, data: dto }), true);
    } catch (error) {
      rethrowPrismaError(error, 'Kode meja sudah dipakai');
    }
  }

  /** QR lama langsung tidak berlaku. */
  async rotate(id: string): Promise<TableView> {
    try {
      return toView(
        await this.prisma.diningTable.update({ where: { id }, data: { qrToken: newQrToken() } }),
        true,
      );
    } catch (error) {
      rethrowPrismaError(error);
    }
  }
}
