export const PLANTS = [
  { id: "cuautitlan", label: "Planta Cuautitlan", shortLabel: "Cuautitlan" },
  { id: "toluca", label: "Planta Toluca", shortLabel: "Toluca" },
] as const;

export type PlantId = (typeof PLANTS)[number]["id"];
export type PlantScope = PlantId | "nacional";
export type ActivePlantId = PlantId | "todas";

export const DEFAULT_PLANT_ID: PlantId = "cuautitlan";

const PLANT_IDS = new Set<string>(PLANTS.map((plant) => plant.id));
const PLANT_ALIASES: Record<PlantId, string[]> = {
  cuautitlan: [
    "cuautitlan",
    "planta cuautitlan",
    "ctt",
    "cttopmn001",
  ],
  toluca: [
    "toluca",
    "planta toluca",
    "tol",
    "tolopmn001",
  ],
};

function normalizePlantAlias(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPlantId(value: unknown): value is PlantId {
  return typeof value === "string" && PLANT_IDS.has(value);
}

export function isActivePlantId(value: unknown): value is ActivePlantId {
  return value === "todas" || isPlantId(value);
}

export function normalizePlantId(value: unknown): PlantId {
  return isPlantId(value) ? value : DEFAULT_PLANT_ID;
}

export function parsePlantId(value: unknown): PlantId | null {
  if (isPlantId(value)) return value;
  if (typeof value !== "string") return null;

  const normalized = normalizePlantAlias(value);
  if (!normalized) return null;

  for (const plant of PLANTS) {
    if (PLANT_ALIASES[plant.id].some((alias) => normalizePlantAlias(alias) === normalized)) {
      return plant.id;
    }
  }

  return null;
}

export function normalizeActivePlantId(value: unknown): ActivePlantId {
  return isActivePlantId(value) ? value : "todas";
}

export function plantLabel(value: unknown) {
  if (value === "todas") return "Vista global";
  if (value === "nacional") return "Nacional";
  return PLANTS.find((plant) => plant.id === value)?.label ?? "Planta sin definir";
}
