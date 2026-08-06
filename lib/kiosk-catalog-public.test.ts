import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildKioskCatalogPayload, type InventoryImportItem } from "./inventory-import";
import { buildPublicKioskCatalogPayload } from "./kiosk-catalog-public";

const FORBIDDEN_FIELDS = [
  "stock",
  "minStock",
  "reorderPoint",
  "material",
  "location",
  "unit",
  "unitCost",
  "stockUnit",
  "packageUnit",
  "unitsPerPackage",
  "stockPackageInput",
  "packageRuleId",
  "durationRuleSapMaterial",
];

describe("public kiosk catalog", () => {
  it("removes private inventory fields from imported items and size variants", () => {
    const imported = {
      id: "cuautitlan__BOT-01",
      sku: "BOT-01",
      material: "26000000",
      name: "Bota de seguridad",
      category: "Calzado",
      replacementDays: 365,
      stock: 10,
      minStock: 2,
      reorderPoint: 3,
      hasSizes: true,
      location: "A-01",
      unit: "PZA",
      unitCost: 900,
      plantaId: "cuautitlan",
      sizes: {
        "26": {
          sku: "BOT-01-26",
          material: "26000001",
          stock: 4,
          minStock: 1,
          location: "A-01-26",
          unitCost: 900,
          available: true,
        },
      },
    } as InventoryImportItem;

    const publicItem = buildKioskCatalogPayload(imported);
    for (const field of FORBIDDEN_FIELDS) assert.equal(field in publicItem, false, field);

    const publicVariant = (publicItem.sizes as Record<string, Record<string, unknown>>)["26"];
    assert.deepEqual(publicVariant, { sku: "BOT-01-26", available: true });
  });

  it("publishes only availability after a stock change", () => {
    const publicItem = buildPublicKioskCatalogPayload({
      sku: "MANGA-01",
      material: "26008560",
      name: "Manga resistente a cortes",
      category: "Ropa",
      replacementDays: 30,
      stock: 25,
      stockUnit: "PZA",
      packageUnit: "CAJA",
      unitsPerPackage: 25,
      unitCost: 148.5,
      plantaId: "cuautitlan",
      available: true,
    }, { available: false });

    assert.equal(publicItem.available, false);
    assert.equal(publicItem.name, "Manga resistente a cortes");
    for (const field of FORBIDDEN_FIELDS) assert.equal(field in publicItem, false, field);
  });
});
