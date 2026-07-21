export const EMPLOYEE_COST_CENTERS = [
  "PRODUCCIÓN",
  "OPERACIONES",
  "SQE",
  "MANTENIMIENTO",
  "PROCESOS CRÍTICOS",
  "RH",
  "FINANZAS",
  "SINDICATO",
] as const;

export type EmployeeCostCenter = (typeof EMPLOYEE_COST_CENTERS)[number];

export function normalizeEmployeeCostCenter(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").toLocaleUpperCase("es-MX")
    : "";
}

export function isEmployeeCostCenter(value: unknown): value is EmployeeCostCenter {
  const normalized = normalizeEmployeeCostCenter(value);
  return EMPLOYEE_COST_CENTERS.some((costCenter) => costCenter === normalized);
}
