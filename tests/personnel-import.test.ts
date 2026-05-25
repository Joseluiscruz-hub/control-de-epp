import { describe, expect, it } from "vitest";
import {
  buildEmployeeImportPayload,
  buildKioskEmployeeImportPayload,
  hasBlockingPersonnelIssues,
  parsePersonnelTsv,
} from "../lib/personnel-import";

const HEADERS = [
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
];

function row(overrides: Partial<Record<(typeof HEADERS)[number], string>> = {}) {
  const values: Record<(typeof HEADERS)[number], string> = {
    "Número de personal": "1881",
    "Nombre editado del empleado o candidato": "JUAN PEREZ",
    "Fecha de alta": "01/02/2026",
    "División de personal": "DIVISION BAJIO",
    "ID POSICIÓN": "POS-001",
    Posición: "OPERADOR",
    "Area de Personal": "PRODUCCION",
    "AREA PLANTA": "EMBOTELLADO",
    CECO: "CC100",
    Función: "OPERACION",
    "Fecha de Nacimiento": "02/03/1990",
    RFC: "PEPJ900302ABC",
    IMSS: "12345678901",
    CURP: "PEPJ900302HDFABC01",
    SEXO: "M",
  };

  return HEADERS.map((header) => overrides[header] ?? values[header]).join("\t");
}

function tsv(rows: string[]) {
  return [HEADERS.join("\t"), ...rows].join("\n");
}

describe("personnel import", () => {
  it("parses valid TSV rows and normalizes core fields", () => {
    const parsed = parsePersonnelTsv(tsv([row()]));

    expect(hasBlockingPersonnelIssues(parsed)).toBe(false);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({
      id: "1881",
      name: "JUAN PEREZ",
      hireDate: "2026-02-01",
      area: "EMBOTELLADO",
      personnelArea: "PRODUCCION",
      position: "OPERADOR",
    });
    expect(parsed.summary.validRows).toBe(1);
    expect(parsed.summary.byPlantArea).toEqual({ EMBOTELLADO: 1 });
  });

  it("reports duplicate employee ids as blocking errors", () => {
    const parsed = parsePersonnelTsv(
      tsv([
        row({ "Número de personal": "1881" }),
        row({ "Número de personal": "1881", "Nombre editado del empleado o candidato": "ANA LOPEZ" }),
      ])
    );

    expect(hasBlockingPersonnelIssues(parsed)).toBe(true);
    expect(parsed.summary.duplicateIds).toEqual(["1881"]);
    expect(parsed.records).toHaveLength(1);
  });

  it("builds admin and kiosk payloads from parsed records", () => {
    const parsed = parsePersonnelTsv(tsv([row()]));
    const record = parsed.records[0];

    expect(buildEmployeeImportPayload(record)).toMatchObject({
      id: "1881",
      active: true,
      source: "baseop",
      schemaVersion: 1,
      costCenter: "CC100",
    });
    expect(buildKioskEmployeeImportPayload(record)).toMatchObject({
      name: "JUAN PEREZ",
      active: true,
      source: "baseop",
      schemaVersion: 1,
    });
  });
});
