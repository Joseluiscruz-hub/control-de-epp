import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectInventoryImportDocumentId } from "./inventory-document-id";

describe("selectInventoryImportDocumentId", () => {
  it("prefiere el documento scoped cuando ya existe", () => {
    assert.equal(
      selectInventoryImportDocumentId({
        baseId: "epp-guante",
        scopedId: "cuautitlan__epp-guante",
        plantaId: "cuautitlan",
        baseDocument: { exists: true, plantaId: "cuautitlan" },
        scopedDocument: { exists: true, plantaId: "cuautitlan" },
      }),
      "cuautitlan__epp-guante"
    );
  });

  it("reutiliza documentos legacy de la misma planta", () => {
    assert.equal(
      selectInventoryImportDocumentId({
        baseId: "epp-guante",
        scopedId: "cuautitlan__epp-guante",
        plantaId: "cuautitlan",
        baseDocument: { exists: true, plantaId: "cuautitlan" },
      }),
      "epp-guante"
    );
  });

  it("reutiliza documentos legacy sin planta para completar la migracion", () => {
    assert.equal(
      selectInventoryImportDocumentId({
        baseId: "epp-guante",
        scopedId: "cuautitlan__epp-guante",
        plantaId: "cuautitlan",
        baseDocument: { exists: true },
      }),
      "epp-guante"
    );
  });

  it("crea documento scoped cuando el legacy pertenece a otra planta", () => {
    assert.equal(
      selectInventoryImportDocumentId({
        baseId: "epp-guante",
        scopedId: "toluca__epp-guante",
        plantaId: "toluca",
        baseDocument: { exists: true, plantaId: "cuautitlan" },
      }),
      "toluca__epp-guante"
    );
  });
});
