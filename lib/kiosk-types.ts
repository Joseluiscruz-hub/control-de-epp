export interface KioskEmployee {
  id: string;
  name: string;
  area?: string;
  personnelArea?: string;
  plantArea?: string;
  position?: string;
  jobFunction?: string;
  active: boolean;
  pin?: string;
  termsAccepted: boolean;
  termsAcceptedAt?: string;
  firstLogin: boolean;
  source?: string;
  schemaVersion?: number;
  plantaId?: string;
}

export interface PPESizeVariant {
  sku: string;
  material?: string;
  stock?: number;
  minStock?: number;
  available?: boolean;
}

export interface PPECatalogItem {
  id: string;
  name: string;
  category: string;
  replacementDays: number;
  durationRuleId?: string;
  durationRuleSource?: string;
  durationRuleSku?: string;
  durationRuleSapMaterial?: string | null;
  requiredQuantity?: number;
  requiredUnit?: string;
  unitCost?: number;
  hasSizes: boolean;
  active?: boolean;
  sizes?: Record<string, PPESizeVariant>;
  // Para EPP sin tallas, SKU y stock directo:
  sku?: string;
  material?: string;
  stock?: number;
  minStock?: number;
  available?: boolean;
  imageUrl?: string;
  plantaId?: string;
}

export type ReplacementReason = "vida_util" | "desgaste" | "extravio";

export interface KioskRequestItem {
  itemId: string;
  itemName: string;
  sku: string;
  size: string;
  replacementDays: number;
  durationRuleId?: string;
  durationRuleSource?: string;
  durationRuleSku?: string;
  durationRuleSapMaterial?: string | null;
  requiredQuantity?: number;
  requiredUnit?: string;
  replacementReason?: ReplacementReason;
  chargeAmount?: number;
  signatureDataUrl?: string | null;
  earlyReplacementAlert?: KioskEarlyReplacementAlert;
}

export type KioskRequestStatus = "pending" | "approved" | "rejected";

export interface KioskEarlyReplacementAlert {
  itemId: string;
  itemName: string;
  sku: string;
  size: string;
  replacementDays: number;
  daysUsed: number;
  daysRemaining: number;
  assignedAt?: Date | string;
  nextEligibleAt?: Date | string;
  previousAssignmentId?: string;
  severity: "warning" | "critical";
}

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
