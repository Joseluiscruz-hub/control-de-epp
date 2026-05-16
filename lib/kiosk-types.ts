export interface KioskEmployee {
  id: string;
  name: string;
  area?: string;
  active: boolean;
  pin?: string;
  termsAccepted: boolean;
  termsAcceptedAt?: string;
  firstLogin: boolean;
}

export interface PPESizeVariant {
  sku: string;
  stock?: number;
  minStock?: number;
  available?: boolean;
}

export interface PPECatalogItem {
  id: string;
  name: string;
  category: string;
  replacementDays: number;
  unitCost?: number;
  hasSizes: boolean;
  active?: boolean;
  sizes?: Record<string, PPESizeVariant>;
  // Para EPP sin tallas, SKU y stock directo:
  sku?: string;
  stock?: number;
  minStock?: number;
  available?: boolean;
  imageUrl?: string;
}

export type ReplacementReason = "vida_util" | "desgaste" | "extravio";

export interface KioskRequestItem {
  itemId: string;
  itemName: string;
  sku: string;
  size: string;
  replacementDays: number;
}

export type KioskRequestStatus = "pending" | "approved" | "rejected";

export interface KioskSession {
  employeeId: string;
  employeeName: string;
  selectedItem?: PPECatalogItem;
  selectedSize?: string;
  selectedSku?: string;
  reason?: ReplacementReason;
  chargeAmount?: number;
  evidenceFile?: File;
  signatureDataUrl?: string;
}
