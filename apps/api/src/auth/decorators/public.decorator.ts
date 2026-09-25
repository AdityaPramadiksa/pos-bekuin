import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Endpoint tanpa login (login, health, menu QR pelanggan). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
