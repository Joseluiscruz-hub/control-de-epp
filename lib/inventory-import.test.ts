import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasBlockingInventoryIssues, parseInventoryTsv } from "./inventory-import";

const HEADERS = [
  "Planta",
  "Alma",
  "Material",
  "Texto breve de Material",
  "Talla",
  "Ubicación",
  "Umb",
  "Precio variable",
  "Stock",
].join("\t");

function row(values: string[]) {
  return values.join("\t");
}

describe("parseInventoryTsv", () => {
  it("exige columna Planta para evitar mezclas entre plantas", () => {
    const parsed = parseInventoryTsv([
      HEADERS.replace("Planta\t", ""),
      row(["1000", "MAT-1", "GUANTE NITRILO T M", "M", "A1", "PZA", "10", "5"]),
    ].join("\n"));

    assert.equal(hasBlockingInventoryIssues(parsed), true);
    assert.equal(parsed.issues.some((issue) => issue.message.includes("Faltan columnas requeridas: Planta")), true);
  });

  it("rechaza alias de planta desconocidos", () => {
    const parsed = parseInventoryTsv([
      HEADERS,
      row(["Otra planta", "1000", "MAT-1", "GUANTE NITRILO T M", "M", "A1", "PZA", "10", "5"]),
    ].join("\n"));

    assert.equal(hasBlockingInventoryIssues(parsed), true);
    assert.match(parsed.issues[0]?.message ?? "", /Planta invalida/);
  });

  it("mantiene separado el mismo producto cuando pertenece a plantas distintas", () => {
    const parsed = parseInventoryTsv([
      HEADERS,
      row(["CTTOPMN001", "1000", "MAT-1", "GUANTE NITRILO T M", "M", "A1", "PZA", "10", "5"]),
      row(["TOLOPMN001", "1000", "MAT-1", "GUANTE NITRILO T M", "M", "B1", "PZA", "10", "7"]),
    ].join("\n"));

    assert.equal(hasBlockingInventoryIssues(parsed), false);
    assert.equal(parsed.summary.itemCount, 2);
    assert.deepEqual(parsed.summary.byPlant, {
      "Planta Cuautitlan": 1,
      "Planta Toluca": 1,
    });
    assert.deepEqual(parsed.items.map((item) => item.plantaId).sort(), ["cuautitlan", "toluca"]);
    assert.equal(new Set(parsed.items.map((item) => item.id)).size, 1);
  });

  it("aplica punto de pedido configurado por material", () => {
    const parsed = parseInventoryTsv([
      HEADERS,
      row(["CTTOPMN001", "1000", "26149605", "GUANTE NITRILO T M", "M", "A1", "PZA", "10", "4"]),
    ].join("\n"));

    assert.equal(hasBlockingInventoryIssues(parsed), false);
    assert.equal(parsed.items[0]?.reorderPoint, 5);
    assert.equal(parsed.items[0]?.minStock, 5);
    assert.equal(parsed.items[0]?.sizes?.M?.reorderPoint, 5);
    assert.equal(parsed.items[0]?.sizes?.M?.minStock, 5);
  });
});
