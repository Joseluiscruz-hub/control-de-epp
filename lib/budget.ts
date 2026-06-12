import { isPlantId, type PlantScope } from "@/lib/plants";

export const DEFAULT_BUDGET_THRESHOLDS = [80, 100] as const;

export class BudgetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetValidationError";
  }
}

export interface BudgetGoal {
  id?: string;
  plantaId: PlantScope;
  year: number;
  annualLimit: number;
  monthlyLimits?: Record<string, number>;
  alertThresholds: number[];
  currency: "MXN";
}

export interface BudgetSpending {
  totalSpent: number;
  byMonth: Record<string, number>;
  byCategory: Record<string, number>;
  byArea: Record<string, number>;
  projected: number;
  monthsElapsed: number;
  assignmentCount: number;
  pricedAssignmentCount: number;
  unpricedAssignmentCount: number;
}

function readPositiveNumber(value: unknown, field: string) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new BudgetValidationError(`${field} debe ser un numero positivo.`);
  }
  return Math.round(number * 100) / 100;
}

export function parseBudgetYear(value: unknown, fallback = new Date().getFullYear()) {
  if (value === null || value === undefined || value === "") return fallback;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) {
    throw new BudgetValidationError("El año presupuestal no es valido.");
  }
  return year;
}

export function parseBudgetPlantScope(value: unknown, fallback: PlantScope): PlantScope {
  if (value === null || value === undefined || value === "") return fallback;
  if (value === "nacional" || isPlantId(value)) return value;
  throw new BudgetValidationError("La planta solicitada no es valida.");
}

export function normalizeBudgetGoalInput(input: Record<string, unknown>): BudgetGoal {
  const plantaId = parseBudgetPlantScope(input.plantaId, "nacional");
  const year = parseBudgetYear(input.year);
  const annualLimit = readPositiveNumber(input.annualLimit, "annualLimit");

  let monthlyLimits: Record<string, number> | undefined;
  if (input.monthlyLimits !== undefined && input.monthlyLimits !== null) {
    if (typeof input.monthlyLimits !== "object" || Array.isArray(input.monthlyLimits)) {
      throw new BudgetValidationError("monthlyLimits debe ser un objeto por mes.");
    }

    monthlyLimits = {};
    for (const [month, limit] of Object.entries(input.monthlyLimits)) {
      const monthNumber = Number(month);
      if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
        throw new BudgetValidationError("monthlyLimits contiene un mes no valido.");
      }
      monthlyLimits[String(monthNumber)] = readPositiveNumber(limit, `Limite del mes ${monthNumber}`);
    }
    if (Object.keys(monthlyLimits).length === 0) monthlyLimits = undefined;
  }

  const rawThresholds = input.alertThresholds ?? DEFAULT_BUDGET_THRESHOLDS;
  if (!Array.isArray(rawThresholds) || rawThresholds.length === 0) {
    throw new BudgetValidationError("Debe existir al menos un umbral de alerta.");
  }
  const alertThresholds = [...new Set(rawThresholds.map(Number))]
    .filter((threshold) => Number.isFinite(threshold) && threshold > 0 && threshold <= 100)
    .sort((a, b) => a - b);
  if (alertThresholds.length !== rawThresholds.length) {
    throw new BudgetValidationError("Los umbrales deben ser porcentajes unicos entre 1 y 100.");
  }

  return {
    plantaId,
    year,
    annualLimit,
    ...(monthlyLimits ? { monthlyLimits } : {}),
    alertThresholds,
    currency: "MXN",
  };
}

export function calculateBudgetMetrics(goal: Pick<BudgetGoal, "annualLimit" | "alertThresholds"> | null, spending: Pick<BudgetSpending, "totalSpent"> | null) {
  if (!goal || !spending || goal.annualLimit <= 0) {
    return { pctUsed: 0, available: null, alerts: [] as Array<{ threshold: number; pct: number; triggered: boolean }> };
  }

  const rawPct = (spending.totalSpent / goal.annualLimit) * 100;
  const pct = Math.round(rawPct * 10) / 10;
  return {
    pctUsed: Math.max(0, pct),
    available: Math.max(0, Math.round((goal.annualLimit - spending.totalSpent) * 100) / 100),
    alerts: goal.alertThresholds.map((threshold) => ({
      threshold,
      pct,
      triggered: rawPct >= threshold,
    })),
  };
}
