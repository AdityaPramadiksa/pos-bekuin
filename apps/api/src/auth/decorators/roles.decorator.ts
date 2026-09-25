import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Contoh: @Roles('ADMIN'). Tanpa dekorator = semua user yang login boleh. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
