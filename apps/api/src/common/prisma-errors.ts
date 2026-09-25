import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Ubah error Prisma yang umum menjadi respons HTTP berbahasa Indonesia. */
export function rethrowPrismaError(error: unknown, conflictMessage = 'Data sudah ada'): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new ConflictException(conflictMessage);
    if (error.code === 'P2025') throw new NotFoundException('Data tidak ditemukan');
  }
  throw error;
}
