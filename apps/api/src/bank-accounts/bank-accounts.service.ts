import { Injectable, NotFoundException } from '@nestjs/common';
import type { BankAccount } from '@prisma/client';
import type { BankAccountView } from '@bekuin/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBankAccountDto, UpdateBankAccountDto } from './dto/bank-account.dto';

const toView = (a: BankAccount): BankAccountView => ({
  id: a.id,
  bankName: a.bankName,
  accountNumber: a.accountNumber,
  accountName: a.accountName,
  isActive: a.isActive,
  sortOrder: a.sortOrder,
});

/** Rekening tujuan Transfer yang ditampilkan ke pelanggan. Soft delete lewat isActive. */
@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<BankAccountView[]> {
    const rows = await this.prisma.bankAccount.findMany({
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toView);
  }

  async create(dto: CreateBankAccountDto): Promise<BankAccountView> {
    return toView(await this.prisma.bankAccount.create({ data: dto }));
  }

  async update(id: string, dto: UpdateBankAccountDto): Promise<BankAccountView> {
    const found = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Rekening tidak ditemukan');
    return toView(await this.prisma.bankAccount.update({ where: { id }, data: dto }));
  }
}
