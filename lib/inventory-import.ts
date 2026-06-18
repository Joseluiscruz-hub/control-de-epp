import {
  getEppDurationRule,
  getEppDurationRulePayload,
  resolveEppReplacementDays,
  type EppDurationRule,
} from "./epp-duration-rules";
import { resolveStockFromPackageRule } from "./epp-package-rules";
import { getEppReorderPoint } from "./epp-reorder-points";
import { parsePlantId, plantLabel, type PlantId } from "./plants";

export const INVENTORY_IMPORT_SOURCE = "plant_epp_inventory";
export const INVENTORY_SCHEMA_VERSION = 1;
export const DEFAULT_MIN_STOCK = 2;

const EXPECTED_HEADERS = [
  "Planta",
  "Alma",
  "Material",
  "Texto breve de Material",
  "Talla",
  "Ubicación",
  "Umb",
  "Precio variable",
  "Stock",
] as const;

export interface InventoryVariant {
  size: string;
  sku: string;
  material: string;
  stock: number;
  minStock: number;
  reorderPoint?: number;
  available: boolean;
  location: string;
  unit: string;
  unitCost?: number;
  temporarySku: boolean;
  stockUnit?: "PZA";
  packageUnit?: "CAJA" | "BOLSA";
  unitsPerPackage?: number;
  stockPackageInput?: number;
  packageRuleId?: string;
}

export interface InventoryImportItem {
  id: string;
  plantaId: PlantId;
  sku: string;
  name: string;
  category: string;
  replacementDays: number;
  durationRuleId?: string;
  durationRuleSource?: string;
  durationRuleSku?: string;
  durationRuleSapMaterial?: string | null;
  requiredQuantity?: number;
  requiredUnit?: string;
  stock: number;
  minStock: number;
  reorderPoint?: number;
  hasSizes: boolean;
  sizes?: Record<string, Omit<InventoryVariant, "size">>;
  material: string;
  location: string;
  unit: string;
  unitCost?: number;
  stockUnit?: "PZA";
  packageUnit?: "CAJA" | "BOLSA";
  unitsPerPackage?: number;
  stockPackageInput?: number;
  packageRuleId?: string;
  variants: InventoryVariant[];
  sourceRows: number[];
}

export interface InventoryImportIssue {
  row: number;
  severity: "error" | "warning";
  message: string;
}

export interface InventoryImportSummary {
  totalRows: number;
  validRows: number;
  itemCount: number;
  variantCount: number;
  columnCount: number;
  missingMaterial: number;
  missingStock: number;
  temporarySkuCount: number;
  totalStock: number;
  byCategory: Record<string, number>;
  byPlant: Record<string, number>;
}

export interface ParsedInventoryImport {
  items: InventoryImportItem[];
  issues: InventoryImportIssue[];
  summary: InventoryImportSummary;
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
}

function normalizeCell(value: string) {
  return value.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
}

function parseNumber(value: string): number | undefined {
  const clean = normalizeCell(value).replace(/,/g, "");
  if (!clean) return undefined;
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (["p", "n95", "msa", "pq50"].includes(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ")
    .replace(/\bC\/\b/gi, "c/")
    .replace(/\bP\/\b/gi, "p/")
    .replace(/\bS\/\b/gi, "s/");
}

function stripSapPrefix(text: string) {
  return text
    .replace(/^(?=[0-9A-Z]{4,8}_)(?=[0-9A-Z]{0,8}\d)[0-9A-Z]{4,8}_/, "")
    .replace(/^(?=[0-9A-Z]{4,8}\s+)(?=[0-9A-Z]{0,8}\d)[0-9A-Z]{4,8}\s+/, "")
    .replace(/^(?=[0-9A-Z]{4,8}[A-Za-zÁÉÍÓÚÑáéíóúñ])(?=[0-9A-Z]{0,8}\d)[0-9A-Z]*\d(?=[A-Za-zÁÉÍÓÚÑáéíóúñ])/, "");
}

function normalizeMaterialName(rawName: string, rawSize: string) {
  const size = normalizeCell(rawSize).toUpperCase() || "N/A";
  let name = stripSapPrefix(normalizeCell(rawName))
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  if (size && size !== "N/A") {
    const escapedSize = size.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sizePatterns = [
      new RegExp(`[\\s_-]+T[\\s_-]*${escapedSize}\\b`, "gi"),
      new RegExp(`\\bT${escapedSize}\\b`, "gi"),
      new RegExp(`\\bN\\s*${escapedSize}\\b`, "gi"),
      new RegExp(`\\b${escapedSize}\\b(?=\\s+PQ\\d+)`, "gi"),
    ];
    for (const pattern of sizePatterns) {
      name = name.replace(pattern, " ");
    }
  }

  return name
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/\s+-\s+$/g, "")
    .trim();
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
    upper.includes("IMPERMEABLE") ||
    upper.includes("PANT.") ||
    upper.includes("FAJA") ||
    upper.includes("MANGA") ||
    upper.includes("CAPUCHA")
  ) return "Ropa";
  if (upper.includes("ARNES") || upper.includes("ARNÉS")) return "Arneses";
  return "Otros";
}

function defaultReplacementDays(category: string) {
  switch (category) {
    case "Guantes":
      return 30;
    case "Proteccion Auditiva":
      return 90;
    case "Respiradores":
    case "Gafas":
      return 180;
    case "Cascos":
      return 730;
    case "Calzado":
    case "Ropa":
    case "Arneses":
    default:
      return 365;
  }
}

function incrementCounter(counter: Record<string, number>, key: string) {
  counter[key] = (counter[key] ?? 0) + 1;
}

function createTemporarySku(baseId: string, size: string, rowNumber: number) {
  const suffix = size && size !== "N/A" ? size : `R${rowNumber}`;
  return `TMP-${baseId}-${slugify(suffix)}`.toUpperCase().slice(0, 120);
}

function pickPrimaryVariant(variants: InventoryVariant[]) {
  return [...variants].sort((a, b) => {
    if (a.temporarySku !== b.temporarySku) return a.temporarySku ? 1 : -1;
    return b.stock - a.stock || a.sku.localeCompare(b.sku, "es");
  })[0];
}

export function parseInventoryTsv(text: string): ParsedInventoryImport {
  const issues: InventoryImportIssue[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      items: [],
      issues: [{ row: 0, severity: "error", message: "El archivo está vacío." }],
      summary: {
        totalRows: 0,
        validRows: 0,
        itemCount: 0,
        variantCount: 0,
        columnCount: 0,
        missingMaterial: 0,
        missingStock: 0,
        temporarySkuCount: 0,
        totalStock: 0,
        byCategory: {},
        byPlant: {},
      },
    };
  }

  const headers = lines[0].split("\t").map(normalizeHeader);
  const missingHeaders = EXPECTED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    issues.push({
      row: 1,
      severity: "error",
      message: `Faltan columnas requeridas: ${missingHeaders.join(", ")}.`,
    });
  }

  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  const groups = new Map<string, {
    plantaId: PlantId;
    baseId: string;
    baseName: string;
    category: string;
    durationRule?: EppDurationRule;
    variants: InventoryVariant[];
    sourceRows: number[];
  }>();

  let missingMaterial = 0;
  let missingStock = 0;
  let validRows = 0;

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const rowNumber = lineIndex + 1;
    const cells = lines[lineIndex].split("\t").map(normalizeCell);
    if (cells.length !== headers.length) {
      issues.push({
        row: rowNumber,
        severity: "error",
        message: `La fila tiene ${cells.length} columnas y el encabezado tiene ${headers.length}.`,
      });
      continue;
    }

    const read = (header: (typeof EXPECTED_HEADERS)[number]) => cells[indexByHeader.get(header) ?? -1] ?? "";
    const rawPlant = read("Planta");
    const plantaId = parsePlantId(rawPlant);
    const rawName = read("Texto breve de Material");
    const size = read("Talla").toUpperCase() || "N/A";
    const material = read("Material");
    const stockInput = parseNumber(read("Stock"));
    const unitCost = parseNumber(read("Precio variable"));

    if (!plantaId) {
      issues.push({
        row: rowNumber,
        severity: "error",
        message: "Planta invalida. Usa Cuautitlan, Toluca, CTTOPMN001 o TOLOPMN001.",
      });
      continue;
    }

    if (!rawName) {
      issues.push({ row: rowNumber, severity: "error", message: "Falta texto breve de material." });
      continue;
    }

    if (!material) {
      missingMaterial++;
      issues.push({
        row: rowNumber,
        severity: "warning",
        message: "Falta código de material; se generará SKU temporal.",
      });
    }

    if (stockInput === undefined) {
      missingStock++;
      issues.push({
        row: rowNumber,
        severity: "warning",
        message: "Falta stock; se cargará como 0 unidades.",
      });
    }

    const baseName = normalizeMaterialName(rawName, size);
    const category = inferCategory(baseName);
    const baseId = `epp-${slugify(baseName || rawName)}`;
    const sku = material || createTemporarySku(baseId, size, rowNumber);
    const durationRule = getEppDurationRule({
      sku,
      material,
      description: rawName,
      name: baseName,
    });
    const stockConversion = resolveStockFromPackageRule({
      name: baseName || rawName,
      size,
      stockInput: stockInput ?? 0,
    });
    const reorderPoint = getEppReorderPoint(material, sku);

    const variant: InventoryVariant = {
      size,
      sku,
      material,
      stock: stockConversion.stock,
      minStock: reorderPoint ?? DEFAULT_MIN_STOCK,
      ...(reorderPoint !== undefined ? { reorderPoint } : {}),
      available: stockConversion.stock > 0,
      location: read("Ubicación"),
      unit: (stockConversion.metadata?.stockUnit ?? read("Umb")) || "PZA",
      unitCost,
      temporarySku: !material,
      ...stockConversion.metadata,
    };

    const groupId = `${plantaId}:${baseId}`;
    const current = groups.get(groupId);
    if (current) {
      current.variants.push(variant);
      current.sourceRows.push(rowNumber);
      if (!current.durationRule && durationRule) current.durationRule = durationRule;
    } else {
      groups.set(groupId, {
        plantaId,
        baseId,
        baseName,
        category,
        durationRule,
        variants: [variant],
        sourceRows: [rowNumber],
      });
    }
    validRows++;
  }

  const byCategory: Record<string, number> = {};
  const byPlant: Record<string, number> = {};
  let temporarySkuCount = 0;
  let totalStock = 0;

  const items = Array.from(groups.entries())
    .map(([, group]) => {
      const variants = group.variants.sort((a, b) => a.size.localeCompare(b.size, "es", { numeric: true }));
      const hasSizes = variants.length > 1 || variants.some((variant) => variant.size !== "N/A");
      const primary = pickPrimaryVariant(variants);
      const stock = variants.reduce((sum, variant) => sum + variant.stock, 0);
      const ruleInput = {
        sku: primary.sku,
        material: primary.material,
        name: group.baseName,
        codes: [group.durationRule?.kofSku, group.durationRule?.sapMaterial],
        sizes: Object.fromEntries(variants.map((variant) => [
          variant.size,
          { sku: variant.sku, material: variant.material },
        ])),
      };
      const rulePayload = getEppDurationRulePayload(ruleInput);
      temporarySkuCount += variants.filter((variant) => variant.temporarySku).length;
      totalStock += stock;
      incrementCounter(byCategory, group.category);
      incrementCounter(byPlant, plantLabel(group.plantaId));
      const reorderPoint = getEppReorderPoint(primary.material, primary.sku);
      const minStock = hasSizes
        ? variants.reduce((sum, variant) => sum + variant.minStock, 0)
        : reorderPoint ?? DEFAULT_MIN_STOCK;

      const sizes = hasSizes
        ? Object.fromEntries(
            variants.map((variant) => {
              const { size, ...payload } = variant;
              return [size, cleanUndefined(payload)];
            })
          ) as Record<string, Omit<InventoryVariant, "size">>
        : undefined;

      return {
        id: group.baseId,
        plantaId: group.plantaId,
        sku: primary.sku,
        name: titleCase(group.baseName),
        category: group.category,
        replacementDays:
          group.durationRule?.replacementDays ??
          resolveEppReplacementDays(ruleInput, defaultReplacementDays(group.category)),
        ...rulePayload,
        stock,
        minStock,
        reorderPoint,
        hasSizes,
        sizes,
        material: primary.material,
        location: primary.location,
        unit: primary.unit,
        unitCost: primary.unitCost,
        stockUnit: primary.stockUnit,
        packageUnit: primary.packageUnit,
        unitsPerPackage: primary.unitsPerPackage,
        stockPackageInput: primary.stockPackageInput,
        packageRuleId: primary.packageRuleId,
        variants,
        sourceRows: group.sourceRows,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category, "es") || a.name.localeCompare(b.name, "es"));

  return {
    items,
    issues,
    summary: {
      totalRows: Math.max(0, lines.length - 1),
      validRows,
      itemCount: items.length,
      variantCount: items.reduce((sum, item) => sum + item.variants.length, 0),
      columnCount: headers.length,
      missingMaterial,
      missingStock,
      temporarySkuCount,
      totalStock,
      byCategory,
      byPlant,
    },
  };
}

export function hasBlockingInventoryIssues(parsed: ParsedInventoryImport) {
  return parsed.issues.some((issue) => issue.severity === "error");
}

function cleanUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

export function buildInventoryCatalogPayload(item: InventoryImportItem) {
  const reorderPoint = item.reorderPoint ?? getEppReorderPoint(item.material, item.sku);
  return cleanUndefined({
    sku: item.sku,
    plantaId: item.plantaId,
    name: item.name,
    category: item.category,
    replacementDays: item.replacementDays,
    durationRuleId: item.durationRuleId,
    durationRuleSource: item.durationRuleSource,
    durationRuleSku: item.durationRuleSku,
    durationRuleSapMaterial: item.durationRuleSapMaterial,
    requiredQuantity: item.requiredQuantity,
    requiredUnit: item.requiredUnit,
    stock: item.stock,
    minStock: item.minStock ?? reorderPoint ?? DEFAULT_MIN_STOCK,
    reorderPoint,
    hasSizes: item.hasSizes,
    sizes: item.sizes,
    material: item.material,
    location: item.location,
    unit: item.unit,
    unitCost: item.unitCost,
    stockUnit: item.stockUnit,
    packageUnit: item.packageUnit,
    unitsPerPackage: item.unitsPerPackage,
    stockPackageInput: item.stockPackageInput,
    packageRuleId: item.packageRuleId,
    active: true,
    available: item.stock > 0,
    source: INVENTORY_IMPORT_SOURCE,
    schemaVersion: INVENTORY_SCHEMA_VERSION,
  });
}

export function buildKioskCatalogPayload(item: InventoryImportItem) {
  return buildInventoryCatalogPayload(item);
}
