import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  candidateMatchesCatalogCodes,
  normalizeManualSku,
  resolveCanonicalEppCatalogItem,
  validateManualSku,
} from "./epp-master-catalog";

describe("manual EPP master catalog", () => {
  it("normalizes separators and casing in a supplied SKU", () => {
    assert.equal(normalizeManualSku(" 2-kpm-0 "), "2KPM0");
  });

  it("blocks empty, temporary and non-identifying SKU values", () => {
    assert.match(validateManualSku(""), /Ingresa/);
    assert.match(validateManualSku("TMP-1234"), /temporales/);
    assert.match(validateManualSku("CASCO"), /número/);
  });

  it("uses the canonical name and 365-day validity for recent coveralls", () => {
    const item = resolveCanonicalEppCatalogItem("26016867");
    assert.deepEqual(item, {
      sku: "26016867",
      material: "26016867",
      name: "OVEROL DUPONT EPP QC 127S XL TYCHEM",
      category: "Ropa",
      replacementDays: 365,
      unit: "PZA",
      minStock: 2,
      aliases: ["26016867"],
      source: "master_catalog",
    });
  });

  it("maps a KOF alias to one stable SAP SKU", () => {
    const item = resolveCanonicalEppCatalogItem("2-kpm-0");
    assert.equal(item?.sku, "26149605");
    assert.equal(item?.material, "26149605");
    assert.equal(item?.name, "OVEROL TYVEK T-M");
    assert.deepEqual(item?.aliases, ["26149605", "2KPM0"]);
  });

  it("takes name, category and validity from an existing catalog candidate", () => {
    const item = resolveCanonicalEppCatalogItem("4AG93", [{
      sku: "4AG93",
      material: "26012345",
      name: "GAFAS DE SEGURIDAD LENTE CLARO",
      category: "Gafas",
      replacementDays: 180,
      unit: "PZA",
      minStock: 4,
    }]);

    assert.equal(item?.sku, "26012345");
    assert.equal(item?.name, "GAFAS DE SEGURIDAD LENTE CLARO");
    assert.equal(item?.category, "Gafas");
    assert.equal(item?.replacementDays, 180);
    assert.equal(item?.minStock, 4);
  });

  it("recognizes aliases on catalog candidates and rejects unknown SKU values", () => {
    const candidate = {
      sku: "26149605",
      durationRuleSku: "2KPM0",
    };
    assert.equal(candidateMatchesCatalogCodes(candidate, ["2-kpm-0"]), true);
    assert.equal(resolveCanonicalEppCatalogItem("99999999"), undefined);
  });
});
