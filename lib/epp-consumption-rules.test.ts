import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  EPP_CONSUMPTION_RULES,
  findEppConsumptionRule,
  resolveAssignmentReportConsumption,
  resolveEppConsumption,
} from "./epp-consumption-rules";
import { resolveStockFromPackageRule } from "./epp-package-rules";

describe("EPP consumption rules", () => {
  test("contains the 15 configured SAP materials", () => {
    assert.equal(EPP_CONSUMPTION_RULES.length, 15);
    assert.deepEqual(
      EPP_CONSUMPTION_RULES.map((rule) => rule.sapMaterial),
      [
        "26016866", "26016869", "26016897", "26149610", "26149609",
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

  test("multiplies the unit decrease by the physical quantity issued", () => {
    assert.equal(resolveEppConsumption({ sku: "1YEM2", issuedQuantity: 2 }).quantity, 0.02);
    assert.equal(resolveEppConsumption({ material: "26149552", issuedQuantity: 3 }).quantity, 0.24);
  });

  test("matches known KOF aliases without using material names", () => {
    assert.equal(findEppConsumptionRule({ sku: "3ppm1" })?.sapMaterial, "26149611");
    assert.equal(findEppConsumptionRule({ sku: "2-LEM-0" })?.sapMaterial, "26149552");
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
  });
});
