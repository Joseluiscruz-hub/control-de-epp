export const EPP_CONSUMPTION_QUANTITY_UNIT = "UMB" as const;

export interface EppConsumptionRule {
  id: string;
  sapMaterial: string;
  kofSku?: string;
  unitsPerPackage: number;
  unitDecrease: number;
}

export interface EppConsumptionResult {
  quantity: number;
  issuedQuantity: number;
  quantityUnit: typeof EPP_CONSUMPTION_QUANTITY_UNIT | "PZA";
  rule?: EppConsumptionRule;
}

export const EPP_CONSUMPTION_RULES: readonly EppConsumptionRule[] = [
  { id: "sap-26016863", sapMaterial: "26016863", unitsPerPackage: 25, unitDecrease: 0.04 },
  { id: "sap-26016866", sapMaterial: "26016866", unitsPerPackage: 25, unitDecrease: 0.04 },
  { id: "sap-26016869", sapMaterial: "26016869", unitsPerPackage: 25, unitDecrease: 0.04 },
  { id: "sap-26016867", sapMaterial: "26016867", unitsPerPackage: 12, unitDecrease: 0.08 },
  { id: "sap-26149605", sapMaterial: "26149605", kofSku: "2KPM0", unitsPerPackage: 25, unitDecrease: 0.04 },
  { id: "sap-26149607", sapMaterial: "26149607", kofSku: "2KPM2", unitsPerPackage: 25, unitDecrease: 0.04 },
  { id: "sap-26149608", sapMaterial: "26149608", kofSku: "2KPM3", unitsPerPackage: 25, unitDecrease: 0.04 },
  { id: "sap-26016897", sapMaterial: "26016897", unitsPerPackage: 25, unitDecrease: 0.04 },
  { id: "sap-26149610", sapMaterial: "26149610", kofSku: "3PPM0", unitsPerPackage: 12, unitDecrease: 0.08 },
  { id: "sap-26149609", sapMaterial: "26149609", kofSku: "3PNM9", unitsPerPackage: 12, unitDecrease: 0.08 },
  { id: "sap-26149611", sapMaterial: "26149611", kofSku: "3PPM1", unitsPerPackage: 12, unitDecrease: 0.08 },
  { id: "sap-26149578", sapMaterial: "26149578", kofSku: "1YEM2", unitsPerPackage: 100, unitDecrease: 0.01 },
  { id: "sap-26149580", sapMaterial: "26149580", kofSku: "28C088", unitsPerPackage: 100, unitDecrease: 0.01 },
  { id: "sap-26149552", sapMaterial: "26149552", kofSku: "2LEM0", unitsPerPackage: 12, unitDecrease: 0.08 },
  { id: "sap-26149553", sapMaterial: "26149553", kofSku: "2LEM1", unitsPerPackage: 12, unitDecrease: 0.08 },
  { id: "sap-26149554", sapMaterial: "26149554", kofSku: "2LEM2", unitsPerPackage: 12, unitDecrease: 0.08 },
  { id: "sap-26149555", sapMaterial: "26149555", kofSku: "2LEM3", unitsPerPackage: 12, unitDecrease: 0.08 },
  { id: "sap-26016860", sapMaterial: "26016860", unitsPerPackage: 12, unitDecrease: 0.08 },
  { id: "sap-26016859", sapMaterial: "26016859", unitsPerPackage: 12, unitDecrease: 0.08 },
  { id: "sap-26016827", sapMaterial: "26016827", unitsPerPackage: 12, unitDecrease: 0.08 },
];

function normalizeCode(value: unknown) {
  return typeof value === "string"
    ? value.toUpperCase().replace(/[^A-Z0-9]/g, "")
    : "";
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isPackageUnit(value: unknown) {
  return value === "CAJA" || value === "BOLSA";
}

export function roundEppConsumptionQuantity(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function findEppConsumptionRule(input: {
  sku?: unknown;
  material?: unknown;
  codes?: readonly unknown[];
}) {
  const codes = new Set(
    [input.sku, input.material, ...(input.codes ?? [])]
      .map(normalizeCode)
      .filter(Boolean)
  );

  return EPP_CONSUMPTION_RULES.find((rule) => (
    codes.has(rule.sapMaterial) || Boolean(rule.kofSku && codes.has(rule.kofSku))
  ));
}

export function resolveEppConsumption(input: {
  sku?: unknown;
  material?: unknown;
  codes?: readonly unknown[];
  issuedQuantity?: unknown;
  stockUnit?: unknown;
  packageUnit?: unknown;
  unitsPerPackage?: unknown;
}): EppConsumptionResult {
  const issuedQuantity = positiveNumber(input.issuedQuantity, 1);
  const rule = findEppConsumptionRule(input);

  if (!rule) {
    const unitsPerPackage = positiveNumber(input.unitsPerPackage, 0);
    if (isPackageUnit(input.stockUnit) && input.stockUnit === input.packageUnit && unitsPerPackage > 0) {
      return {
        quantity: roundEppConsumptionQuantity(issuedQuantity / unitsPerPackage),
        issuedQuantity,
        quantityUnit: EPP_CONSUMPTION_QUANTITY_UNIT,
      };
    }

    return {
      quantity: roundEppConsumptionQuantity(issuedQuantity),
      issuedQuantity,
      quantityUnit: "PZA",
    };
  }

  return {
    quantity: roundEppConsumptionQuantity(issuedQuantity * rule.unitDecrease),
    issuedQuantity,
    quantityUnit: EPP_CONSUMPTION_QUANTITY_UNIT,
    rule,
  };
}

export function resolveAssignmentReportConsumption(input: {
  sku?: unknown;
  material?: unknown;
  codes?: readonly unknown[];
  quantity?: unknown;
  issuedQuantity?: unknown;
  quantityUnit?: unknown;
}) {
  const persistedQuantity = positiveNumber(input.quantity, 0);
  if (input.quantityUnit === EPP_CONSUMPTION_QUANTITY_UNIT && persistedQuantity > 0) {
    return {
      quantity: roundEppConsumptionQuantity(persistedQuantity),
      quantityUnit: EPP_CONSUMPTION_QUANTITY_UNIT,
      rule: findEppConsumptionRule(input),
    };
  }

  const issuedQuantity = positiveNumber(input.issuedQuantity, persistedQuantity || 1);
  const resolved = resolveEppConsumption({ ...input, issuedQuantity });
  return {
    quantity: resolved.quantity,
    quantityUnit: resolved.quantityUnit,
    rule: resolved.rule,
  };
}
