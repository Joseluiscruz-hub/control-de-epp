export type SolpedAlertInput = {
  itemName: string;
  sku: string;
  material: string;
  size?: string;
  stock: number;
  reorderPoint: number;
  shortage: number;
};

export type SolpedExportOptions = {
  plantName: string;
  generatedAt?: Date;
  generatedBy?: string;
};

export type SolpedExportRow = {
  folio: string;
  generatedAt: string;
  plantName: string;
  material: string;
  description: string;
  sku: string;
  size: string;
  stock: number;
  reorderPoint: number;
  shortage: number;
  suggestedQuantity: number;
  reason: string;
  status: string;
};

const CSV_SEPARATOR = ";";
const EXCEL_UTF8_BOM = "\uFEFF";

function twoDigits(value: number) {
  return String(value).padStart(2, "0");
}

function formatTimestampForFolio(date: Date) {
  return [
    date.getFullYear(),
    twoDigits(date.getMonth() + 1),
    twoDigits(date.getDate()),
    "-",
    twoDigits(date.getHours()),
    twoDigits(date.getMinutes()),
  ].join("");
}

function formatTimestampForCsv(date: Date) {
  return [
    `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)}/${date.getFullYear()}`,
    `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`,
  ].join(" ");
}

function normalizePlantForFile(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "planta";
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function buildSolpedFolio(options: SolpedExportOptions) {
  const generatedAt = options.generatedAt ?? new Date();
  return `SOLPED-${normalizePlantForFile(options.plantName).toUpperCase()}-${formatTimestampForFolio(generatedAt)}`;
}

export function buildSolpedFilename(options: SolpedExportOptions) {
  const generatedAt = options.generatedAt ?? new Date();
  return `${buildSolpedFolio({ ...options, generatedAt })}.csv`;
}

export function buildSolpedRows(alerts: SolpedAlertInput[], options: SolpedExportOptions): SolpedExportRow[] {
  const generatedAt = options.generatedAt ?? new Date();
  const folio = buildSolpedFolio({ ...options, generatedAt });
  const generatedAtLabel = formatTimestampForCsv(generatedAt);

  return alerts.map((alert) => {
    const stock = Number.isFinite(alert.stock) ? alert.stock : 0;
    const reorderPoint = Number.isFinite(alert.reorderPoint) ? alert.reorderPoint : 0;
    const shortage = Math.max(0, Number.isFinite(alert.shortage) ? alert.shortage : reorderPoint - stock);
    const suggestedQuantity = Math.max(1, reorderPoint, shortage);

    return {
      folio,
      generatedAt: generatedAtLabel,
      plantName: options.plantName,
      material: alert.material,
      description: alert.itemName,
      sku: alert.sku,
      size: alert.size ?? "N/A",
      stock,
      reorderPoint,
      shortage,
      suggestedQuantity,
      reason: stock <= 0 ? "Agotado total" : "Punto de pedido alcanzado",
      status: "Pendiente de SOLPED",
    };
  });
}

export function buildSolpedCsv(alerts: SolpedAlertInput[], options: SolpedExportOptions) {
  const generatedBy = options.generatedBy?.trim();
  const rows = buildSolpedRows(alerts, options);
  const headers = [
    "Folio",
    "Fecha generacion",
    "Planta",
    "Generado por",
    "Material SAP",
    "Descripcion",
    "SKU tecnico",
    "Talla",
    "Stock actual PZA",
    "Punto pedido PZA",
    "Faltante PZA",
    "Cantidad sugerida PZA",
    "Motivo",
    "Estatus",
  ];

  const body = rows.map((row) => [
    row.folio,
    row.generatedAt,
    row.plantName,
    generatedBy || "Sistema AssetGuard",
    row.material,
    row.description,
    row.sku,
    row.size,
    row.stock,
    row.reorderPoint,
    row.shortage,
    row.suggestedQuantity,
    row.reason,
    row.status,
  ]);

  return [
    headers.map(csvCell).join(CSV_SEPARATOR),
    ...body.map((row) => row.map(csvCell).join(CSV_SEPARATOR)),
  ].join("\r\n");
}

export function downloadSolpedCsv(alerts: SolpedAlertInput[], options: SolpedExportOptions) {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (alerts.length === 0) return false;

  const generatedAt = options.generatedAt ?? new Date();
  const csv = `${EXCEL_UTF8_BOM}${buildSolpedCsv(alerts, { ...options, generatedAt })}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = buildSolpedFilename({ ...options, generatedAt });
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
  return true;
}
