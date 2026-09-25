import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type CustomerView, normalizeName, type OrderView } from '@bekuin/shared';
import { orderInclude, toOrderView } from '../orders/order-mapper';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: string | undefined, limit = 100): Promise<CustomerView[]> {
    const where: Prisma.CustomerWhereInput = { isActive: true };
    const term = q?.trim();
    if (term) {
      where.OR = [
        { nameNormalized: { contains: normalizeName(term) } },
        { phone: { contains: term.replace(/\s/g, '') } },
      ];
    }
    const customers = await this.prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      take: limit,
    });
    if (customers.length === 0) return [];
    const stats = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { customerId: { in: customers.map((c) => c.id) }, status: 'PAID' },
      _count: true,
      _sum: { total: true },
      _max: { createdAt: true },
    });
    const byId = new Map(stats.map((s) => [s.customerId, s]));
    return customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      note: c.note,
      isActive: c.isActive,
      orderCount: byId.get(c.id)?._count ?? 0,
      lastOrderAt: byId.get(c.id)?._max.createdAt?.toISOString() ?? null,
      totalSpent: byId.get(c.id)?._sum.total ?? 0,
    }));
  }

  /** Autocomplete nama (awal kata dulu). */
  async suggest(q: string): Promise<{ id: string; name: string; phone: string | null }[]> {
    const term = normalizeName(q ?? '');
    if (term.length < 1) return [];
    const rows = await this.prisma.customer.findMany({
      where: { isActive: true, nameNormalized: { contains: term } },
      select: { id: true, name: true, phone: true, nameNormalized: true },
      take: 20,
    });
    return rows
      .sort(
        (a, b) =>
          Number(!a.nameNormalized.startsWith(term)) - Number(!b.nameNormalized.startsWith(term)) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, 8)
      .map(({ nameNormalized: _n, ...rest }) => rest);
  }

  async create(dto: CreateCustomerDto): Promise<CustomerView> {
    const c = await this.prisma.customer.create({
      data: { ...dto, nameNormalized: normalizeName(dto.name) },
    });
    return (await this.list(c.name)).find((x) => x.id === c.id)!;
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerView> {
    const data: Prisma.CustomerUpdateInput = { ...dto };
    if (dto.name) data.nameNormalized = normalizeName(dto.name);
    const c = await this.prisma.customer.update({ where: { id }, data }).catch(() => {
      throw new NotFoundException('Pelanggan tidak ditemukan');
    });
    return (
      (await this.list(c.name)).find((x) => x.id === c.id) ?? {
        ...c,
        orderCount: 0,
        lastOrderAt: null,
        totalSpent: 0,
      }
    );
  }

  /** Semua order pelanggan duplikat pindah ke pelanggan yang dipertahankan; duplikat dinonaktifkan. */
  async merge(keepId: string, duplicateId: string): Promise<CustomerView> {
    if (keepId === duplicateId) throw new BadRequestException('Pilih dua pelanggan yang berbeda');
    const [keep, dup] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: keepId } }),
      this.prisma.customer.findUnique({ where: { id: duplicateId } }),
    ]);
    if (!keep || !dup) throw new NotFoundException('Pelanggan tidak ditemukan');
    await this.prisma.$transaction([
      this.prisma.order.updateMany({
        where: { customerId: duplicateId },
        data: { customerId: keepId },
      }),
      this.prisma.customer.update({
        where: { id: keepId },
        data: {
          phone: keep.phone ?? dup.phone,
          note: [keep.note, dup.note].filter(Boolean).join(' · ') || null,
        },
      }),
      this.prisma.customer.update({ where: { id: duplicateId }, data: { isActive: false } }),
    ]);
    return (await this.list(keep.name)).find((x) => x.id === keepId)!;
  }

  /** Order terakhir pelanggan (untuk tombol Order ulang). */
  async lastOrder(id: string): Promise<OrderView | null> {
    const order = await this.prisma.order.findFirst({
      where: { customerId: id, status: { in: ['PAID', 'PENDING'] } },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    });
    return order ? toOrderView(order, true) : null;
  }
}
