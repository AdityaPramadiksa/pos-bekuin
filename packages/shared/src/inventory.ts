import type { BaseUnit, StockStatus } from './stock';

export interface PurchaseView {
  id: string;
  date: string;
  supplier: string | null;
  note: string | null;
  total: number;
  photoUrl: string | null;
  createdBy: string;
  createdAt: string;
  items: {
    ingredientId: string;
    name: string;
    baseUnit: BaseUnit;
    packQty: number;
    qtyBase: number;
    totalPrice: number;
    unitCost: number;
  }[];
}

export interface ProductionNeed {
  ingredientId: string;
  name: string;
  baseUnit: BaseUnit;
  need: number;
  available: number;
  unitCost: number;
  cost: number;
  short: boolean;
}

export interface ProductionPreview {
  recipeId: string;
  recipeName: string;
  type: 'SEMI_FINISHED' | 'PRODUCT';
  batchQty: number;
  expectedOutput: number;
  outputUnit: BaseUnit;
  outputName: string;
  needs: ProductionNeed[];
  estimatedCost: number;
  costPerUnit: number;
  canProduce: boolean;
}

export interface ProductionView {
  id: string;
  type: 'SEMI_FINISHED' | 'PRODUCT';
  recipeName: string;
  outputName: string;
  outputUnit: BaseUnit;
  batchQty: number;
  expectedOutput: number;
  actualOutput: number;
  yieldVariance: number;
  totalCost: number;
  costPerUnit: number;
  note: string | null;
  createdBy: string;
  createdAt: string;
  lines: { name: string; baseUnit: BaseUnit; qtyUsed: number; unitCost: number }[];
}

export interface OpnameItemView {
  id: string;
  itemType: 'PRODUCT' | 'INGREDIENT';
  itemId: string;
  name: string;
  unit: string;
  systemQty: number;
  physicalQty: number | null;
  diffQty: number;
  unitCost: number;
  diffValue: number;
}

export interface OpnameView {
  id: string;
  status: 'DRAFT' | 'FINALIZED';
  note: string | null;
  createdBy: string;
  finalizedBy: string | null;
  createdAt: string;
  finalizedAt: string | null;
  items: OpnameItemView[];
  totalDiffValue: number;
  countedItems: number;
}

export type { StockStatus };
