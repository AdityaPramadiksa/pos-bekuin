export type StockStatus = 'OK' | 'LOW' | 'OUT';
export type IngredientType = 'RAW' | 'SEMI_FINISHED' | 'PACKAGING';
export type BaseUnit = 'GRAM' | 'ML' | 'PCS';
export type MovementType =
  | 'PURCHASE'
  | 'PRODUCTION_IN'
  | 'PRODUCTION_OUT'
  | 'SALE'
  | 'VOID_RETURN'
  | 'OPNAME_ADJUST'
  | 'MANUAL_ADJUST'
  | 'WASTE';

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  PURCHASE: 'Stok masuk',
  PRODUCTION_IN: 'Hasil produksi',
  PRODUCTION_OUT: 'Dipakai produksi',
  SALE: 'Penjualan',
  VOID_RETURN: 'Void (kembali)',
  OPNAME_ADJUST: 'Opname',
  MANUAL_ADJUST: 'Penyesuaian',
  WASTE: 'Rusak/basi',
};

export const INGREDIENT_TYPE_LABEL: Record<IngredientType, string> = {
  RAW: 'Bahan mentah',
  SEMI_FINISHED: 'Setengah jadi',
  PACKAGING: 'Kemasan',
};

export function stockStatus(qty: number, min: number): StockStatus {
  if (qty <= 0) return 'OUT';
  if (qty <= min) return 'LOW';
  return 'OK';
}

export interface ProductStockView {
  id: string;
  name: string;
  stockPcs: number;
  minStockPcs: number;
  avgCostPerPcs: number;
  status: StockStatus;
  isActive: boolean;
}

export interface IngredientStockView {
  id: string;
  name: string;
  type: IngredientType;
  baseUnit: BaseUnit;
  stockQty: number;
  minStock: number;
  avgCostPerUnit: number;
  status: StockStatus;
  isActive: boolean;
}

export interface StockMovementView {
  id: string;
  itemType: 'PRODUCT' | 'INGREDIENT';
  itemId: string;
  itemName: string;
  unit: string;
  type: MovementType;
  qtyChange: number;
  balanceAfter: number;
  unitCost: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  userName: string;
  createdAt: string;
}
