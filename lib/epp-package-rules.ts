import { findEppConsumptionRule, roundEppConsumptionQuantity } from "./epp-consumption-rules";

export type PackageUnit = "CAJA" | "BOLSA";
export type StockUnit = "PZA" | PackageUnit;

export interface EppPackageRule {
  id: string;
  packageUnit: PackageUnit;
  unitsPerPackage: number;
  allowedSizes?: readonly string[];
  matches: (normalizedName: string) => boolean;
}

export interface PackageStockMetadata {
  stockUnit: StockUnit;
  packageUnit: PackageUnit;
  unitsPerPackage: number;
  stockPackageInput: number;
  packageRuleId: string;
}

const PACKAGE_RULES: readonly EppPackageRule[] = [
  {
    id: "mascarilla-3m-n95",
    packageUnit: "CAJA",
    unitsPerPackage: 10,
    matches: (name) => name.includes("MASCARILLA") && name.includes("N95"),
  },
  {
    id: "tychem",
    packageUnit: "CAJA",
    unitsPerPackage: 12,
    allowedSizes: ["M", "G", "EG"],
    matches: (name) => name.includes("TYCHEM"),
  },
  {
    id: "tyvek",
    packageUnit: "CAJA",
    unitsPerPackage: 25,
    allowedSizes: ["M", "G", "XL"],
    matches: (name) => name.includes("TYVEK") || name.includes("TYVEN"),
  },
  {
    id: "guantes-nitrilo",
    packageUnit: "BOLSA",
    unitsPerPackage: 12,
    allowedSizes: ["7", "8", "9", "10"],
    matches: (name) => name.includes("GUANTE") && name.includes("NITRILO"),
  },
  {
    id: "mangas-anti-corte",
    packageUnit: "CAJA",
    unitsPerPackage: 50,
    allowedSizes: ["CHICA", "GRANDE"],
    matches: (name) => name.includes("MANGA") && (name.includes("ANTICORTE") || name.includes("ANTI CORTE")),
  },
  {
    id: "tapones-auditivos",
    packageUnit: "CAJA",
    unitsPerPackage: 100,
    matches: (name) => name.includes("TAPON") && (name.includes("AUDIT") || name.includes("AUDITIVO")),
  },
];

export function normalizeEppRuleText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function normalizeEppRuleSize(value: string) {
  return normalizeEppRuleText(value).replace(/\s+/g, "");
}

export function findEppPackageRule(params: { name?: string | null; size?: string | null }) {
  const normalizedName = normalizeEppRuleText(params.name ?? "");
  const normalizedSize = normalizeEppRuleSize(params.size ?? "");
  if (!normalizedName) return null;

  for (const rule of PACKAGE_RULES) {
    if (!rule.matches(normalizedName)) continue;
    if (rule.allowedSizes && !rule.allowedSizes.includes(normalizedSize)) continue;
    return rule;
  }
  return null;
}

export function convertStockPackagesToPieces(stockPackageInput: number, unitsPerPackage: number) {
  const raw = Number(stockPackageInput) * unitsPerPackage;
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.round(raw));
}

export function buildPackageStockMetadata(
  rule: Pick<EppPackageRule, "id" | "packageUnit" | "unitsPerPackage">,
  stockPackageInput: number,
  stockUnit: StockUnit = "PZA"
): PackageStockMetadata {
  return {
    stockUnit,
    packageUnit: rule.packageUnit,
    unitsPerPackage: rule.unitsPerPackage,
    stockPackageInput: Number.isFinite(stockPackageInput) ? stockPackageInput : 0,
    packageRuleId: rule.id,
  };
}

export function isPackageUnit(value: unknown): value is PackageUnit {
  return value === "CAJA" || value === "BOLSA";
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveStockFromPackageRule(params: {
  name?: string | null;
  size?: string | null;
  sku?: string | null;
  material?: string | null;
  codes?: readonly unknown[];
  stockInput: number;
  packageUnit?: PackageUnit | null;
  unitsPerPackage?: number | null;
}) {
  const manualPackageUnit = isPackageUnit(params.packageUnit) ? params.packageUnit : undefined;
  const manualUnitsPerPackage = positiveNumber(params.unitsPerPackage);
  if (manualPackageUnit && manualUnitsPerPackage) {
    return {
      stock: Number.isFinite(params.stockInput) ? params.stockInput : 0,
      metadata: buildPackageStockMetadata(
        {
          id: `manual-${manualPackageUnit.toLowerCase()}`,
          packageUnit: manualPackageUnit,
          unitsPerPackage: manualUnitsPerPackage,
        },
        params.stockInput,
        manualPackageUnit
      ),
    };
  }

  const nameRule = findEppPackageRule({ name: params.name, size: params.size });
  const consumptionRule = findEppConsumptionRule({
    sku: params.sku,
    material: params.material,
    codes: params.codes,
  });
  const rule = consumptionRule
    ? {
        id: consumptionRule.id,
        packageUnit: nameRule?.packageUnit ?? "CAJA" as const,
        unitsPerPackage: consumptionRule.unitsPerPackage,
      }
    : nameRule;
  if (!rule) {
    return {
      stock: Number.isFinite(params.stockInput) ? params.stockInput : 0,
      metadata: undefined as PackageStockMetadata | undefined,
    };
  }

  return {
    stock: convertStockPackagesToPieces(params.stockInput, rule.unitsPerPackage),
    metadata: buildPackageStockMetadata(rule, params.stockInput),
  };
}

export function resolveInventoryStockDecrease(params: {
  stockUnit?: unknown;
  packageUnit?: unknown;
  unitsPerPackage?: unknown;
  issuedQuantity?: unknown;
}) {
  const issuedQuantity = positiveNumber(params.issuedQuantity) ?? 1;
  const unitsPerPackage = positiveNumber(params.unitsPerPackage);

  if (isPackageUnit(params.stockUnit) && params.stockUnit === params.packageUnit && unitsPerPackage) {
    return roundEppConsumptionQuantity(issuedQuantity / unitsPerPackage);
  }

  return roundEppConsumptionQuantity(issuedQuantity);
}

