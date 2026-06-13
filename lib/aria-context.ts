export type AriaDataDocument = {
  id: string;
  data: Record<string, unknown>;
};

type BuildAriaContextInput = {
  scope: string;
  inventory: AriaDataDocument[];
  employees: AriaDataDocument[];
  assignments: AriaDataDocument[];
  budgetGoal?: Record<string, unknown> | null;
  assignmentSampleLimited?: boolean;
  now?: Date;
};

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate() as Date;
  }
  return null;
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function readVariants(data: Record<string, unknown>) {
  if (!data.sizes || typeof data.sizes !== "object" || Array.isArray(data.sizes)) return [];
  return Object.values(data.sizes as Record<string, unknown>)
    .filter((variant): variant is Record<string, unknown> => (
      Boolean(variant) && typeof variant === "object" && !Array.isArray(variant)
    ));
}

function readInventoryStock(data: Record<string, unknown>) {
  const variants = readVariants(data);
  if (variants.length > 0) {
    return variants.reduce((sum, variant) => sum + Math.max(0, readNumber(variant.stock)), 0);
  }
  return Math.max(0, readNumber(data.stock));
}

function readInventoryUnitCost(data: Record<string, unknown>) {
  const direct = readNumber(data.unitCost);
  if (direct > 0) return direct;
  const costs = readVariants(data).map((variant) => readNumber(variant.unitCost)).filter((cost) => cost > 0);
  return costs.length > 0 ? round(costs.reduce((sum, cost) => sum + cost, 0) / costs.length) : 0;
}

function inventorySeverity(status: string) {
  return status === "agotado" ? 0 : status === "critico" ? 1 : status === "bajo" ? 2 : 3;
}

export function buildAriaOperationalContext({
  scope,
  inventory,
  employees,
  assignments,
  budgetGoal = null,
  assignmentSampleLimited = false,
  now = new Date(),
}: BuildAriaContextInput) {
  const nowMs = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();

  const inventoryRows = inventory.map(({ id, data }) => {
    const stock = readInventoryStock(data);
    const minStock = Math.max(0, readNumber(data.minStock, 20));
    const status = stock <= 0
      ? "agotado"
      : stock <= minStock
        ? "critico"
        : stock <= Math.max(20, minStock * 2)
          ? "bajo"
          : "saludable";
    return {
      id,
      itemId: id,
      sku: readText(data.sku) || readText(data.material) || id,
      name: readText(data.name) || id,
      category: readText(data.category) || "Sin categoria",
      plantaId: readText(data.plantaId) || "sin_planta",
      stock,
      minStock,
      unitCost: readInventoryUnitCost(data),
      status,
    };
  });

  const inventoryById = new Map(inventoryRows.map((item) => [item.id, item]));
  const inventoryBySku = new Map(inventoryRows.map((item) => [item.sku, item]));
  const employeeAreas = new Map<string, number>();
  employees.forEach(({ data }) => {
    const area = readText(data.area) || readText(data.personnelArea) || readText(data.plantArea) || "Sin area";
    employeeAreas.set(area, (employeeAreas.get(area) ?? 0) + 1);
  });

  type ConsumptionRow = {
    itemId: string;
    sku: string;
    itemName: string;
    quantity30: number;
    quantity90: number;
    deliveries90: number;
    lastAssignedAt: string | null;
  };
  const consumption = new Map<string, ConsumptionRow>();
  const areas = new Map<string, { area: string; quantity30: number; quantity90: number; deliveries90: number }>();
  let yearlySpent = 0;
  let yearlyAssignments = 0;
  let pricedAssignments = 0;
  let validAssignments = 0;

  assignments.forEach(({ data }) => {
    const status = readText(data.status).toLowerCase();
    if (["cancelled", "canceled", "rejected", "deleted"].includes(status)) return;
    const assignedAt = readDate(data.assignedAt);
    if (!assignedAt || assignedAt.getTime() > nowMs) return;
    const ageDays = (nowMs - assignedAt.getTime()) / dayMs;
    const quantity = Math.max(1, readNumber(data.quantity ?? data.requiredQuantity, 1));
    const itemId = readText(data.itemId);
    const sku = readText(data.sku) || itemId || "SIN SKU";
    const key = itemId || sku;
    const item = inventoryById.get(itemId) ?? inventoryBySku.get(sku);
    const area = readText(data.area) || readText(data.employeeArea) || "Sin area";
    const unitCost = Math.max(0, readNumber(data.unitCost, item?.unitCost ?? 0));
    validAssignments += 1;

    if (assignedAt.getTime() >= yearStart) {
      yearlyAssignments += 1;
      if (unitCost > 0) {
        yearlySpent += unitCost * quantity;
        pricedAssignments += 1;
      }
    }
    if (ageDays > 90) return;

    const current = consumption.get(key) ?? {
      itemId,
      sku,
      itemName: readText(data.itemName) || item?.name || sku,
      quantity30: 0,
      quantity90: 0,
      deliveries90: 0,
      lastAssignedAt: null,
    };
    current.quantity90 += quantity;
    current.deliveries90 += 1;
    if (ageDays <= 30) current.quantity30 += quantity;
    if (!current.lastAssignedAt || assignedAt.toISOString() > current.lastAssignedAt) {
      current.lastAssignedAt = assignedAt.toISOString();
    }
    consumption.set(key, current);

    const areaRow = areas.get(area) ?? { area, quantity30: 0, quantity90: 0, deliveries90: 0 };
    areaRow.quantity90 += quantity;
    areaRow.deliveries90 += 1;
    if (ageDays <= 30) areaRow.quantity30 += quantity;
    areas.set(area, areaRow);
  });

  const consumptionRows = [...consumption.values()].map((row) => {
    const item = inventoryById.get(row.itemId) ?? inventoryBySku.get(row.sku);
    const dailyRate90 = row.quantity90 > 0 ? row.quantity90 / 90 : 0;
    const stock = item?.stock ?? null;
    const minStock = item?.minStock ?? 0;
    const daysCoverage = stock !== null && dailyRate90 > 0 ? Math.floor(stock / dailyRate90) : null;
    const reorderQuantity60 = stock !== null && dailyRate90 > 0
      ? Math.max(0, Math.ceil(dailyRate90 * 60 + minStock - stock))
      : 0;
    return {
      ...row,
      stock,
      minStock,
      dailyRate90: round(dailyRate90, 3),
      daysCoverage,
      reorderQuantity60,
    };
  }).sort((a, b) => b.quantity90 - a.quantity90);

  const areaRows = [...areas.values()].map((row) => {
    const previousMonthlyAverage = Math.max(0, (row.quantity90 - row.quantity30) / 2);
    const variationPct = previousMonthlyAverage > 0
      ? round(((row.quantity30 - previousMonthlyAverage) / previousMonthlyAverage) * 100, 1)
      : null;
    return {
      ...row,
      activeEmployees: employeeAreas.get(row.area) ?? 0,
      variationPct,
      anomaly: row.quantity30 >= 5 && variationPct !== null && variationPct >= 50,
    };
  }).sort((a, b) => b.quantity90 - a.quantity90);

  const annualLimit = Math.max(0, readNumber(budgetGoal?.annualLimit));
  const unpricedYearlyAssignments = yearlyAssignments - pricedAssignments;
  const budgetComplete = !assignmentSampleLimited && unpricedYearlyAssignments === 0;
  const roundedSpent = round(yearlySpent);

  return {
    generatedAt: now.toISOString(),
    scope,
    dataQuality: {
      assignmentSampleLimited,
      pricedAssignments,
      unpricedYearlyAssignments,
      validAssignments,
      note: assignmentSampleLimited
        ? "Las metricas de consumo y gasto son parciales porque se alcanzo el limite de lectura."
        : unpricedYearlyAssignments > 0
          ? "El gasto es parcial porque existen asignaciones del ano sin costo disponible."
        : "La ventana consultada se proceso completa.",
    },
    totals: {
      inventoryItems: inventoryRows.length,
      totalStock: inventoryRows.reduce((sum, item) => sum + item.stock, 0),
      activeEmployees: employees.length,
      assignmentsAnalyzed: validAssignments,
    },
    inventoryPriorities: inventoryRows
      .sort((a, b) => inventorySeverity(a.status) - inventorySeverity(b.status) || a.stock - b.stock)
      .slice(0, 80),
    consumptionByItem: consumptionRows.slice(0, 30),
    consumptionByArea: areaRows.slice(0, 20),
    purchaseSuggestions: consumptionRows
      .filter((row) => row.reorderQuantity60 > 0)
      .sort((a, b) => b.reorderQuantity60 - a.reorderQuantity60)
      .slice(0, 20),
    employeeDistribution: [...employeeAreas.entries()]
      .map(([area, total]) => ({ area, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20),
    budget: annualLimit > 0
      ? {
          annualLimit,
          totalSpent: budgetComplete ? roundedSpent : null,
          sampledSpent: roundedSpent,
          utilizationPct: budgetComplete ? round((roundedSpent / annualLimit) * 100, 1) : null,
          complete: budgetComplete,
          alertThresholds: Array.isArray(budgetGoal?.alertThresholds) ? budgetGoal.alertThresholds : [80, 100],
        }
      : null,
  };
}
