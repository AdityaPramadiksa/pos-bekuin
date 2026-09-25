import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, type Setting } from '@prisma/client';
import {
  qrisInfo,
  QrisError,
  type OpeningHours,
  type SettingsView,
  validateOpeningHours,
} from '@bekuin/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateSettingsDto } from './dto/update-settings.dto';

const SETTINGS_ID = 'default';

function toView(s: Setting): SettingsView {
  return {
    storeName: s.storeName,
    tagline: s.tagline,
    address: s.address,
    phone: s.phone,
    receiptFooter: s.receiptFooter,
    qrisImageUrl: s.qrisImageUrl,
    qrisPayload: s.qrisPayload,
    logoUrl: s.logoUrl,
    isStoreOpen: s.isStoreOpen,
    openingHours: (s.openingHours as OpeningHours | null) ?? null,
    qrOrderingEnabled: s.qrOrderingEnabled,
    qrMaxOrderTotal: s.qrMaxOrderTotal,
    blockApproveOnLowStock: s.blockApproveOnLowStock,
    paperWidthChars: s.paperWidthChars,
  };
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<SettingsView> {
    // Baris default dibuat otomatis bila seeder belum dijalankan.
    const s = await this.prisma.setting.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
    return toView(s);
  }

  async update(dto: UpdateSettingsDto): Promise<SettingsView> {
    const hoursError = validateOpeningHours(dto.openingHours);
    if (hoursError) throw new BadRequestException(hoursError);

    if (typeof dto.qrisPayload === 'string') dto.qrisPayload = this.validQris(dto.qrisPayload);

    const { openingHours, ...rest } = dto;
    const data: Prisma.SettingUpdateInput = { ...rest };
    if (openingHours !== undefined) {
      data.openingHours = openingHours === null ? Prisma.DbNull : openingHours;
    }
    const s = await this.prisma.setting.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...(data as Prisma.SettingCreateInput) },
    });
    return toView(s);
  }

  /** Hanya QRIS statis yang valid (CRC benar) yang disimpan. */
  private validQris(payload: string): string | null {
    const text = payload.trim();
    if (!text) return null;
    try {
      if (!qrisInfo(text).isStatic) {
        throw new BadRequestException('Pakai QRIS statis toko (yang tanpa nominal)');
      }
    } catch (error) {
      if (error instanceof QrisError) throw new BadRequestException(error.message);
      throw error;
    }
    return text;
  }
}
