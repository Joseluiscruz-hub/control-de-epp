export const PLANTS = [
  { id: "cuautitlan", label: "Planta Cuautitlan", shortLabel: "Cuautitlan" },
  { id: "toluca", label: "Planta Toluca", shortLabel: "Toluca" },
] as const;

export type PlantId = (typeof PLANTS)[number]["id"];
export type PlantScope = PlantId | "nacional";
export type ActivePlantId = PlantId | "todas";

export const DEFAULT_PLANT_ID: PlantId = "cuautitlan";

const PLANT_IDS = new Set<string>(PLANTS.map((plant) => plant.id));

export function isPlantId(value: unknown): value is PlantId {
  return typeof value === "string" && PLANT_IDS.has(value);
}

export function isActivePlantId(value: unknown): value is ActivePlantId {
  return value === "todas" || isPlantId(value);
}

export function normalizePlantId(value: unknown): PlantId {
  return isPlantId(value) ? value : DEFAULT_PLANT_ID;
}

export function normalizeActivePlantId(value: unknown): ActivePlantId {
  return isActivePlantId(value) ? value : "todas";
}

export function plantLabel(value: unknown) {
  if (value === "todas") return "Vista global";
  if (value === "nacional") return "Nacional";
  return PLANTS.find((plant) => plant.id === value)?.label ?? "Planta sin definir";
}
