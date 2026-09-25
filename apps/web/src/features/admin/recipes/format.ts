import { STOCK_UNIT_LABEL, type BaseUnit } from '@bekuin/shared';

export const unitLabel = (u: BaseUnit) => STOCK_UNIT_LABEL[u];

/** Rp59,47 / g */
export function costPerUnitLabel(cost: number, unit: BaseUnit) {
  const value = cost.toLocaleString('id-ID', { maximumFractionDigits: cost < 100 ? 2 : 0 });
  return `Rp${value}/${unitLabel(unit)}`;
}

export const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
