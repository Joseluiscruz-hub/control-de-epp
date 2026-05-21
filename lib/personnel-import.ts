export const PERSONNEL_IMPORT_SOURCE = "baseop";
export const PERSONNEL_SCHEMA_VERSION = 1;

const EXPECTED_HEADERS = [
  "Número de personal",
  "Nombre editado del empleado o candidato",
  "Fecha de alta",
  "División de personal",
  "ID POSICIÓN",
  "Posición",
  "Area de Personal",
  "AREA PLANTA",
  "CECO",
  "Función",
  "Fecha de Nacimiento",
  "RFC",
  "IMSS",
  "CURP",
  "SEXO",
] as const;

const HEADER_TO_KEY = {
  "Número de personal": "id",
  "Nombre editado del empleado o candidato": "name",
  "Fecha de alta": "hireDate",
  "División de personal": "division",
  "ID POSICIÓN": "positionId",
  "Posición": "position",
  "Area de Personal": "personnelArea",
  "AREA PLANTA": "plantArea",
  "CECO": "costCenter",
  "Función": "jobFunction",
  "SEXO": "sex",
} as const;

export interface PersonnelRecord {
  id: string;
  name: string;
  area: string;
  hireDate: string;
  division: string;
  positionId: string;
  position: string;
  personnelArea: string;
  plantArea: string;
  costCenter: string;
  jobFunction: string;
  sex: string;
  sourceRow: number;
}

export interface PersonnelImportIssue {
  row: number;
  severity: "error" | "warning";
  message: string;
}

export interface PersonnelImportSummary {
  totalRows: number;
  validRows: number;
  columnCount: number;
  duplicateIds: string[];
  byPlantArea: Record<string, number>;
  byPersonnelArea: Record<string, number>;
  byPosition: Record<string, number>;
}

export interface ParsedPersonnelImport {
  records: PersonnelRecord[];
  summary: PersonnelImportSummary;
  issues: PersonnelImportIssue[];
}

export interface EmployeeImportPayload {
  id: string;
  name: string;
  area: string;
  active: boolean;
  division: string;
  personnelArea: string;
  plantArea: string;
  costCenter: string;
  positionId: string;
  position: string;
  jobFunction: string;
  hireDate: string;
  sex: string;
  source: typeof PERSONNEL_IMPORT_SOURCE;
  schemaVersion: typeof PERSONNEL_SCHEMA_VERSION;
}

export interface KioskEmployeeImportPayload {
  name: string;
  area: string;
  active: boolean;
  personnelArea: string;
  plantArea: string;
  position: string;
  jobFunction: string;
  source: typeof PERSONNEL_IMPORT_SOURCE;
  schemaVersion: typeof PERSONNEL_SCHEMA_VERSION;
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
}

function normalizeCell(value: string) {
  return value.replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
}

function normalizeDate(value: string) {
  const clean = normalizeCell(value);
  const match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return clean;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) return clean;

  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function incrementCounter(counter: Record<string, number>, key: string) {
  const label = key || "SIN DATO";
  counter[label] = (counter[label] ?? 0) + 1;
}

function topCounter(input: Record<string, number>, max = 8) {
  return Object.fromEntries(
    Object.entries(input)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
      .slice(0, max)
  );
}

export function parsePersonnelTsv(text: string): ParsedPersonnelImport {
  const issues: PersonnelImportIssue[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      records: [],
      issues: [{ row: 0, severity: "error", message: "El archivo está vacío." }],
      summary: {
        totalRows: 0,
        validRows: 0,
        columnCount: 0,
        duplicateIds: [],
        byPlantArea: {},
        byPersonnelArea: {},
        byPosition: {},
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

  if (headers.length !== EXPECTED_HEADERS.length) {
    issues.push({
      row: 1,
      severity: "warning",
      message: `Se detectaron ${headers.length} columnas; el formato esperado trae ${EXPECTED_HEADERS.length}.`,
    });
  }

  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  const records: PersonnelRecord[] = [];
  const seenIds = new Map<string, number>();
  const duplicateIds = new Set<string>();
  const byPlantArea: Record<string, number> = {};
  const byPersonnelArea: Record<string, number> = {};
  const byPosition: Record<string, number> = {};

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

    const read = (header: keyof typeof HEADER_TO_KEY) => cells[indexByHeader.get(header) ?? -1] ?? "";
    const id = read("Número de personal");
    const name = read("Nombre editado del empleado o candidato");
    const plantArea = read("AREA PLANTA").toUpperCase();
    const personnelArea = read("Area de Personal").toUpperCase();
    const position = read("Posición").toUpperCase();

    if (!id) {
      issues.push({ row: rowNumber, severity: "error", message: "Falta número de personal." });
      continue;
    }

    if (!/^\d+$/.test(id)) {
      issues.push({ row: rowNumber, severity: "error", message: "El número de personal debe ser numérico." });
      continue;
    }

    if (seenIds.has(id)) {
      duplicateIds.add(id);
      issues.push({
        row: rowNumber,
        severity: "error",
        message: `Número de personal duplicado; ya apareció en la fila ${seenIds.get(id)}.`,
      });
      continue;
    }
    seenIds.set(id, rowNumber);

    if (!name) {
      issues.push({ row: rowNumber, severity: "error", message: "Falta nombre del colaborador." });
      continue;
    }

    if (!plantArea) {
      issues.push({ row: rowNumber, severity: "warning", message: "AREA PLANTA viene vacía." });
    }

    const record: PersonnelRecord = {
      id,
      name,
      area: plantArea || personnelArea || "SIN AREA",
      hireDate: normalizeDate(read("Fecha de alta")),
      division: read("División de personal"),
      positionId: read("ID POSICIÓN"),
      position,
      personnelArea,
      plantArea,
      costCenter: read("CECO").toUpperCase(),
      jobFunction: read("Función").toUpperCase(),
      sex: read("SEXO").toUpperCase(),
      sourceRow: rowNumber,
    };

    records.push(record);
    incrementCounter(byPlantArea, record.plantArea);
    incrementCounter(byPersonnelArea, record.personnelArea);
    incrementCounter(byPosition, record.position);
  }

  return {
    records,
    issues,
    summary: {
      totalRows: Math.max(0, lines.length - 1),
      validRows: records.length,
      columnCount: headers.length,
      duplicateIds: Array.from(duplicateIds).sort((a, b) => a.localeCompare(b, "es")),
      byPlantArea: topCounter(byPlantArea),
      byPersonnelArea: topCounter(byPersonnelArea),
      byPosition: topCounter(byPosition),
    },
  };
}

export function hasBlockingPersonnelIssues(parsed: ParsedPersonnelImport) {
  return parsed.issues.some((issue) => issue.severity === "error");
}

export function buildEmployeeImportPayload(record: PersonnelRecord): EmployeeImportPayload {
  return {
    id: record.id,
    name: record.name,
    area: record.area,
    active: true,
    division: record.division,
    personnelArea: record.personnelArea,
    plantArea: record.plantArea,
    costCenter: record.costCenter,
    positionId: record.positionId,
    position: record.position,
    jobFunction: record.jobFunction,
    hireDate: record.hireDate,
    sex: record.sex,
    source: PERSONNEL_IMPORT_SOURCE,
    schemaVersion: PERSONNEL_SCHEMA_VERSION,
  };
}

export function buildKioskEmployeeImportPayload(record: PersonnelRecord): KioskEmployeeImportPayload {
  return {
    name: record.name,
    area: record.area,
    active: true,
    personnelArea: record.personnelArea,
    plantArea: record.plantArea,
    position: record.position,
    jobFunction: record.jobFunction,
    source: PERSONNEL_IMPORT_SOURCE,
    schemaVersion: PERSONNEL_SCHEMA_VERSION,
  };
}
