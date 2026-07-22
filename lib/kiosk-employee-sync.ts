import { normalizePlantId } from "./plants";

function readText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function buildKioskEmployeeSyncPayload(
  employee: Record<string, unknown>,
  fallbackPlant: unknown
) {
  const area = readText(employee.area);

  return {
    name: readText(employee.name),
    area,
    plantaId: normalizePlantId(employee.plantaId ?? fallbackPlant),
    personnelArea: readText(employee.personnelArea),
    plantArea: readText(employee.plantArea) || area,
    costCenter: readText(employee.costCenter),
    position: readText(employee.position),
    jobFunction: readText(employee.jobFunction),
    active: employee.active === true,
  };
}
