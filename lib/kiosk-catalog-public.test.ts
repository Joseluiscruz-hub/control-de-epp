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
  "durationRuleId",
  "durationRuleSource",
  "durationRuleSku",
  "durationRuleSapMaterial",
];

describe("public kiosk catalog", () => {
  it("removes private inventory identifiers and fields from imported items and variants", () => {
    const imported = {
      id: "cuautitlan__26000000",
      sku: "26000000",
      material: "26000000",
      name: "Bota de seguridad",
      category: "Calzado",
      replacementDays: 365,
      durationRuleId: "internal-rule",
      durationRuleSource: "sap",
      durationRuleSku: "2KPM0",
      durationRuleSapMaterial: "26000000",
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
          sku: "26000001",
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

    assert.equal(publicItem.sku, "public:Calzado:Bota de seguridad");
    const publicVariant = (publicItem.sizes as Record<string, Record<string, unknown>>)["26"];
    assert.deepEqual(publicVariant, {
      sku: "public:Calzado:Bota de seguridad:26",
      available: true,
    });

    const serialized = JSON.stringify(publicItem);
    assert.equal(serialized.includes("26000000"), false);
    assert.equal(serialized.includes("26000001"), false);
    assert.equal(serialized.includes("2KPM0"), false);
  });

  it("publishes only safe availability data after a stock change", () => {
    const publicItem = buildPublicKioskCatalogPayload({
      sku: "26008560",
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
    assert.equal(publicItem.sku, "public:Ropa:Manga resistente a cortes");
    assert.equal(JSON.stringify(publicItem).includes("26008560"), false);
    for (const field of FORBIDDEN_FIELDS) assert.equal(field in publicItem, false, field);
  });
});
