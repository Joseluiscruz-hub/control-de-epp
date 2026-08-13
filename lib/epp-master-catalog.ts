import {
  getEppDurationRule,
  type EppDurationRule,
} from "./epp-duration-rules";
import { getEppReorderPoint } from "./epp-reorder-points";

export type CanonicalEppCatalogSource =
  | "master_catalog"
  | "inventory_catalog"
  | "duration_rule";

export interface CanonicalEppCatalogItem {
  sku: string;
  material: string;
  name: string;
  category: string;
  replacementDays: number;
  unit: string;
  minStock: number;
  reorderPoint?: number;
  aliases: string[];
  source: CanonicalEppCatalogSource;
}

export interface EppCatalogCandidate {
  docId?: unknown;
  sku?: unknown;
  material?: unknown;
  name?: unknown;
  category?: unknown;
  replacementDays?: unknown;
  unit?: unknown;
  minStock?: unknown;
  reorderPoint?: unknown;
  durationRuleSku?: unknown;
  durationRuleSapMaterial?: unknown;
  plantaId?: unknown;
}

interface MasterCatalogEntry {
  sku: string;
  aliases?: readonly string[];
  name: string;
  category: string;
  replacementDays: number;
}

const MASTER_CATALOG: readonly MasterCatalogEntry[] = [
  {
    sku: "26016863",
    name: "OVEROL DUPONT EPP TY127S-M",
    category: "Ropa",
    replacementDays: 365,
  },
  {
    sku: "26016869",
    name: "OVEROL DUPONT EPP TY127S-L",
    category: "Ropa",
    replacementDays: 365,
  },
  {
    sku: "26016866",
    name: "OVEROL DUPONT EPP TY127S-XXL",
    category: "Ropa",
    replacementDays: 365,
  },
  {
    sku: "26016867",
    name: "OVEROL DUPONT EPP QC 127S XL TYCHEM",
    category: "Ropa",
    replacementDays: 365,
  },
  {
    sku: "26149605",
    aliases: ["2KPM0"],
    name: "OVEROL TYVEK T-M",
    category: "Ropa",
    replacementDays: 365,
  },
  {
    sku: "26149607",
    aliases: ["2KPM2"],
    name: "OVEROL TYVEK T-XL",
    category: "Ropa",
    replacementDays: 365,
  },
  {
    sku: "26149608",
    aliases: ["2KPM3"],
    name: "OVEROL TYVEK T-XXL",
    category: "Ropa",
    replacementDays: 365,
  },
  {
    sku: "26016902",
    name: "CASCO MSA EPP M2303541AR BLANCO",
    category: "Cascos",
    replacementDays: 365,
  },
];

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readNonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function uniqueCodes(values: unknown[]) {
  return Array.from(new Set(values.map(normalizeManualSku).filter(Boolean)));
}

export function normalizeManualSku(value: unknown) {
  return readText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function validateManualSku(value: unknown) {
  const sku = normalizeManualSku(value);
  if (!sku) return "Ingresa un SKU.";
  if (sku.length < 4 || sku.length > 24) {
    return "El SKU debe tener entre 4 y 24 caracteres.";
  }
  if (!/\d/.test(sku)) {
    return "El SKU debe contener al menos un número.";
  }
  if (sku.startsWith("TMP")) {
    return "No se permiten SKU temporales en altas manuales.";
  }
  return undefined;
}

export function getEppCatalogCandidateCodes(candidate: EppCatalogCandidate) {
  return uniqueCodes([
    candidate.sku,
    candidate.material,
    candidate.durationRuleSku,
    candidate.durationRuleSapMaterial,
  ]);
}

export function candidateMatchesCatalogCodes(
  candidate: EppCatalogCandidate,
  codes: readonly unknown[]
) {
  const expected = new Set(uniqueCodes([...codes]));
  return getEppCatalogCandidateCodes(candidate).some((code) => expected.has(code));
}

function inferCategory(name: string) {
  const upper = name.toUpperCase();
  if (upper.includes("GUANTE")) return "Guantes";
  if (upper.includes("CASCO")) return "Cascos";
  if (upper.includes("BOTA") || upper.includes("CALZADO")) return "Calzado";
  if (upper.includes("LENTE") || upper.includes("GAFA")) return "Gafas";
  if (upper.includes("TAPON") || upper.includes("AUDIT")) return "Proteccion Auditiva";
  if (
    upper.includes("RESPIRADOR") ||
    upper.includes("MASCARILLA") ||
    upper.includes("CARTUCHO") ||
    upper.includes("PREFILTRO")
  ) return "Respiradores";
  if (
    upper.includes("OVEROL") ||
    upper.includes("IMPERMEABLE") ||
    upper.includes("PANT") ||
    upper.includes("FAJA") ||
    upper.includes("MANGA") ||
    upper.includes("CAPUCHA")
  ) return "Ropa";
  if (upper.includes("ARNES") || upper.includes("ARNÉS") || upper.includes("ANTICAIDA")) {
    return "Arneses";
  }
  return "Otros";
}

function buildFromMaster(entry: MasterCatalogEntry): CanonicalEppCatalogItem {
  const reorderPoint = getEppReorderPoint(entry.sku, ...(entry.aliases ?? []));
  return {
    sku: entry.sku,
    material: entry.sku,
    name: entry.name,
    category: entry.category,
    replacementDays: entry.replacementDays,
    unit: "PZA",
    minStock: reorderPoint ?? 2,
    ...(reorderPoint !== undefined ? { reorderPoint } : {}),
    aliases: uniqueCodes([entry.sku, ...(entry.aliases ?? [])]),
    source: "master_catalog",
  };
}

function buildFromDurationRule(
  rule: EppDurationRule,
  requestedSku: string
): CanonicalEppCatalogItem {
  const material = normalizeManualSku(rule.sapMaterial) || requestedSku;
  const canonicalSku = material || normalizeManualSku(rule.kofSku) || requestedSku;
  const reorderPoint = getEppReorderPoint(material, rule.kofSku, requestedSku);
  return {
    sku: canonicalSku,
    material,
    name: rule.description,
    category: inferCategory(rule.description),
    replacementDays: rule.replacementDays,
    unit: "PZA",
    minStock: reorderPoint ?? 2,
    ...(reorderPoint !== undefined ? { reorderPoint } : {}),
    aliases: uniqueCodes([canonicalSku, material, rule.kofSku, requestedSku]),
    source: "duration_rule",
  };
}

function buildFromCandidate(
  candidate: EppCatalogCandidate,
  requestedSku: string
): CanonicalEppCatalogItem | undefined {
  const durationRule = getEppDurationRule({
    sku: readText(candidate.sku),
    material: readText(candidate.material),
    codes: [
      requestedSku,
      readText(candidate.durationRuleSku),
      readText(candidate.durationRuleSapMaterial),
    ],
  });
  const name = readText(candidate.name) || durationRule?.description || "";
  if (!name) return undefined;

  const material =
    normalizeManualSku(candidate.material) ||
    normalizeManualSku(candidate.durationRuleSapMaterial) ||
    normalizeManualSku(durationRule?.sapMaterial) ||
    requestedSku;
  const canonicalSku =
    material ||
    normalizeManualSku(candidate.sku) ||
    normalizeManualSku(durationRule?.kofSku) ||
    requestedSku;
  const category = readText(candidate.category) || inferCategory(name);
  const replacementDays =
    readPositiveInteger(candidate.replacementDays) ??
    durationRule?.replacementDays ??
    365;
  const reorderPoint =
    readNonNegativeInteger(candidate.reorderPoint) ??
    getEppReorderPoint(material, canonicalSku, requestedSku);
  const minStock =
    reorderPoint ??
    readNonNegativeInteger(candidate.minStock) ??
    2;

  return {
    sku: canonicalSku,
    material,
    name,
    category,
    replacementDays,
    unit: normalizeManualSku(candidate.unit) || "PZA",
    minStock,
    ...(reorderPoint !== undefined ? { reorderPoint } : {}),
    aliases: uniqueCodes([
      canonicalSku,
      material,
      requestedSku,
      candidate.sku,
      candidate.durationRuleSku,
      candidate.durationRuleSapMaterial,
      durationRule?.kofSku,
      durationRule?.sapMaterial,
    ]),
    source: "inventory_catalog",
  };
}

export function resolveCanonicalEppCatalogItem(
  inputSku: unknown,
  candidates: readonly EppCatalogCandidate[] = []
): CanonicalEppCatalogItem | undefined {
  if (validateManualSku(inputSku)) return undefined;
  const requestedSku = normalizeManualSku(inputSku);

  const masterEntry = MASTER_CATALOG.find((entry) =>
    uniqueCodes([entry.sku, ...(entry.aliases ?? [])]).includes(requestedSku)
  );
  if (masterEntry) return buildFromMaster(masterEntry);

  const durationRule = getEppDurationRule({
    sku: requestedSku,
    material: requestedSku,
  });
  const lookupCodes = [
    requestedSku,
    durationRule?.kofSku,
    durationRule?.sapMaterial,
  ];
  const candidate = candidates.find((item) =>
    candidateMatchesCatalogCodes(item, lookupCodes)
  );
  const candidateItem = candidate
    ? buildFromCandidate(candidate, requestedSku)
    : undefined;
  if (candidateItem) return candidateItem;

  return durationRule
    ? buildFromDurationRule(durationRule, requestedSku)
    : undefined;
}
