import { Injectable } from '@nestjs/common';
import type { PaymentMethodView } from '@bekuin/shared';
import { rethrowPrismaError } from '../common/prisma-errors';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/payment-method.dto';

@Injectable()
export class PaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeInactive: boolean): Promise<PaymentMethodView[]> {
    return this.prisma.paymentMethod.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethodView> {
    try {
      return await this.prisma.paymentMethod.create({ data: dto });
    } catch (error) {
      rethrowPrismaError(error, 'Nama metode bayar sudah dipakai');
    }
  }

  async update(id: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethodView> {
    try {
      return await this.prisma.paymentMethod.update({ where: { id }, data: dto });
    } catch (error) {
      rethrowPrismaError(error, 'Nama metode bayar sudah dipakai');
    }
  }
}
