import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  EPP_CONSUMPTION_RULES,
  findEppConsumptionRule,
  resolveAssignmentReportConsumption,
  resolveEppConsumption,
} from "./epp-consumption-rules";
import { resolveInventoryStockDecrease, resolveStockFromPackageRule } from "./epp-package-rules";

describe("EPP consumption rules", () => {
  test("contains the 20 configured SAP materials", () => {
    assert.equal(EPP_CONSUMPTION_RULES.length, 20);
    assert.deepEqual(
      EPP_CONSUMPTION_RULES.map((rule) => rule.sapMaterial),
      [
        "26016863", "26016866", "26016869", "26016867", "26149605",
        "26149607", "26149608", "26016897", "26149610", "26149609",
        "26149611", "26149578", "26149580", "26149552", "26149553",
        "26149554", "26149555", "26016860", "26016859", "26016827",
      ]
    );
  });

  test("resolves the exact decimal decrease per issued piece", () => {
    assert.equal(resolveEppConsumption({ material: "26016866" }).quantity, 0.04);
    assert.equal(resolveEppConsumption({ material: "26149610" }).quantity, 0.08);
    assert.equal(resolveEppConsumption({ material: "26149578" }).quantity, 0.01);
  });

  test("applies the package factor configured for all requested coveralls", () => {
    const expectedRules = new Map([
      ["26016863", [25, 0.04]],
      ["26016869", [25, 0.04]],
      ["26016866", [25, 0.04]],
      ["26016867", [12, 0.08]],
      ["26149605", [25, 0.04]],
      ["26149607", [25, 0.04]],
      ["26149608", [25, 0.04]],
    ]);

    for (const [material, [unitsPerPackage, unitDecrease]] of expectedRules) {
      const rule = findEppConsumptionRule({ material });
      assert.equal(rule?.unitsPerPackage, unitsPerPackage);
      assert.equal(rule?.unitDecrease, unitDecrease);
    }
  });

  test("multiplies the unit decrease by the physical quantity issued", () => {
    assert.equal(resolveEppConsumption({ sku: "1YEM2", issuedQuantity: 2 }).quantity, 0.02);
    assert.equal(resolveEppConsumption({ material: "26149552", issuedQuantity: 3 }).quantity, 0.24);
  });

  test("matches known KOF aliases without using material names", () => {
    assert.equal(findEppConsumptionRule({ sku: "3ppm1" })?.sapMaterial, "26149611");
    assert.equal(findEppConsumptionRule({ sku: "2-LEM-0" })?.sapMaterial, "26149552");
  });

  test("matches the KOF aliases added for Tyvek coveralls", () => {
    assert.equal(findEppConsumptionRule({ sku: "2kpm0" })?.sapMaterial, "26149605");
    assert.equal(findEppConsumptionRule({ sku: "2-KPM-2" })?.sapMaterial, "26149607");
    assert.equal(findEppConsumptionRule({ sku: "2 KPM 3" })?.sapMaterial, "26149608");
  });

  test("keeps ordinary materials in pieces", () => {
    assert.deepEqual(resolveEppConsumption({ sku: "CASCO-01", issuedQuantity: 2 }), {
      quantity: 2,
      issuedQuantity: 2,
      quantityUnit: "PZA",
    });
  });

  test("converts legacy assignment quantities and preserves new UMB quantities", () => {
    assert.equal(resolveAssignmentReportConsumption({
      material: "26149553",
      quantity: 1,
    }).quantity, 0.08);

    assert.equal(resolveAssignmentReportConsumption({
      material: "26149553",
      quantity: 0.16,
      issuedQuantity: 2,
      quantityUnit: "UMB",
    }).quantity, 0.16);
  });

  test("uses the exact material rule when package stock is imported", () => {
    const sleeves = resolveStockFromPackageRule({
      material: "26016897",
      name: "Mangas ANSELL EPP PC-7-11-200",
      stockInput: 1,
    });
    assert.equal(sleeves.stock, 25);
    assert.equal(sleeves.metadata?.unitsPerPackage, 25);
    assert.equal((sleeves.stock - 1) / (sleeves.metadata?.unitsPerPackage ?? 1), 0.96);

    const gloves = resolveStockFromPackageRule({
      material: "26016860",
      name: "Guantes ANSELL EPP PM-37175-9",
      stockInput: 3,
    });
    assert.equal(gloves.stock, 36);
    assert.equal(gloves.metadata?.unitsPerPackage, 12);

    const tyvek = resolveStockFromPackageRule({
      material: "26016863",
      name: "OVEROL DUPONT EPP TY127S-M",
      stockInput: 3,
    });
    assert.equal(tyvek.stock, 75);
    assert.equal(tyvek.metadata?.unitsPerPackage, 25);

    const tychem = resolveStockFromPackageRule({
      material: "26016867",
      name: "OVEROL DUPONT EPP QC 127S XL TYCHEM",
      stockInput: 1,
    });
    assert.equal(tychem.stock, 12);
    assert.equal(tychem.metadata?.unitsPerPackage, 12);
  });

  test("keeps manually boxed stock in boxes and discounts the package fraction", () => {
    const boxed = resolveStockFromPackageRule({
      sku: "SKU-CAJA-01",
      name: "Articulo en caja manual",
      stockInput: 1,
      packageUnit: "CAJA",
      unitsPerPackage: 5,
    });

    assert.equal(boxed.stock, 1);
    assert.equal(boxed.metadata?.stockUnit, "CAJA");
    assert.equal(boxed.metadata?.unitsPerPackage, 5);
    assert.equal(resolveInventoryStockDecrease({
      stockUnit: boxed.metadata?.stockUnit,
      packageUnit: boxed.metadata?.packageUnit,
      unitsPerPackage: boxed.metadata?.unitsPerPackage,
      issuedQuantity: 1,
    }), 0.2);
    assert.equal(resolveEppConsumption({
      sku: "SKU-CAJA-01",
      issuedQuantity: 1,
      stockUnit: "CAJA",
      packageUnit: "CAJA",
      unitsPerPackage: 5,
    }).quantity, 0.2);
  });
});
