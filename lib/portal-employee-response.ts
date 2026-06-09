function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildPortalEmployeeResponse(id: string, data: Record<string, unknown>) {
  if (data.active !== true) return null;

  return {
    id,
    active: true,
    name: readText(data.name),
    area: readText(data.area) || readText(data.plantArea) || "SIN AREA",
    plantaId: readText(data.plantaId),
  };
}
