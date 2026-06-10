import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getEppDurationRule,
  getEppDurationRulePayload,
  resolveEppReplacementDays,
} from "./epp-duration-rules";

describe("getEppDurationRule", () => {
  it("resuelve regla por SKU KOF", () => {
    const rule = getEppDurationRule({ sku: "2ZTM8" });
    assert.equal(rule?.id, "kof-2ztm8");
    assert.equal(rule?.replacementDays, 30);
  });

  it("resuelve regla por material SAP", () => {
    const rule = getEppDurationRule({ material: "26149988" });
    assert.equal(rule?.id, "kof-2cvh2");
    assert.equal(rule?.replacementDays, 45);
  });

  it("normaliza guiones, espacios y minusculas en codigos", () => {
    const rule = getEppDurationRule({ sku: " 2-ztm8 " });
    assert.equal(rule?.id, "kof-2ztm8");
  });

  it("busca en codigos alternos", () => {
    const rule = getEppDurationRule({ codes: ["desconocido", "26149553"] });
    assert.equal(rule?.id, "kof-2lem1");
  });

  it("busca en variantes de talla", () => {
    const rule = getEppDurationRule({
      sizes: {
        M: { sku: "sin-regla" },
        G: { material: "26148262" },
      },
    });
    assert.equal(rule?.id, "kof-2kjm7");
  });

  it("busca codigos dentro de nombre o descripcion", () => {
    const rule = getEppDurationRule({ description: "Reposicion de lentes 2CVH2 transparentes" });
    assert.equal(rule?.id, "kof-2cvh2");
  });

  it("devuelve undefined si no hay coincidencia", () => {
    assert.equal(getEppDurationRule({ sku: "NOEXISTE" }), undefined);
  });
});

describe("resolveEppReplacementDays", () => {
  it("usa replacementDays de la regla encontrada", () => {
    assert.equal(resolveEppReplacementDays({ sku: "191K41" }, 90), 45);
  });

  it("usa fallback cuando no hay regla", () => {
    assert.equal(resolveEppReplacementDays({ sku: "NOEXISTE" }, 90), 90);
  });
});

describe("getEppDurationRulePayload", () => {
  it("devuelve payload corporativo para reglas conocidas", () => {
    assert.deepEqual(getEppDurationRulePayload({ sku: "2ZTM8" }), {
      durationRuleId: "kof-2ztm8",
      durationRuleSource: "COCA_KOF_SAP",
      durationRuleSku: "2ZTM8",
      durationRuleSapMaterial: "26148326",
      requiredQuantity: 1,
      requiredUnit: "Pza",
    });
  });

  it("devuelve objeto vacio para reglas desconocidas", () => {
    assert.deepEqual(getEppDurationRulePayload({ sku: "NOEXISTE" }), {});
  });
});
