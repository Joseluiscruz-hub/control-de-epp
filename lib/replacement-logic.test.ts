import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcNextReplacementDate, evaluateReplacement, getStockStatus } from "./replacement-logic";

function daysAgo(n: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date;
}

describe("evaluateReplacement", () => {
  describe("cuando el EPP ya cumplio su vida util", () => {
    it("isEligibleFree es true si los dias usados >= replacementDays", () => {
      const result = evaluateReplacement(daysAgo(90), 90, 500, "vida_util");
      assert.equal(result.isEligibleFree, true);
    });

    it("chargeAmount es 0 aunque el motivo sea extravio", () => {
      const result = evaluateReplacement(daysAgo(100), 90, 500, "extravio");
      assert.equal(result.chargeAmount, 0);
    });

    it("lifeUsedPct queda limitado a 100 cuando se excede la vida util", () => {
      const result = evaluateReplacement(daysAgo(200), 90, 500, "vida_util");
      assert.equal(result.lifeUsedPct, 100);
    });
  });

  describe("cuando el EPP se pierde antes de cumplir su vida util", () => {
    it("calcula cobro proporcional correcto", () => {
      const result = evaluateReplacement(daysAgo(45), 90, 500, "extravio");
      assert.equal(result.chargeAmount, 250);
      assert.equal(result.isEligibleFree, false);
    });

    it("el cobro no supera el costo unitario", () => {
      const result = evaluateReplacement(daysAgo(1), 90, 500, "extravio");
      assert.ok(result.chargeAmount <= 500, `chargeAmount ${result.chargeAmount} supera el costo`);
    });

    it("chargeDescription contiene los dias restantes", () => {
      const result = evaluateReplacement(daysAgo(45), 90, 500, "extravio");
      assert.match(result.chargeDescription, /45/);
    });
  });

  describe("motivo desgaste", () => {
    it("no cobra aunque la vida util no se haya cumplido", () => {
      const result = evaluateReplacement(daysAgo(10), 90, 500, "desgaste");
      assert.equal(result.chargeAmount, 0);
    });
  });

  describe("casos borde", () => {
    it("daysUsed nunca es negativo aunque assignedAt sea en el futuro", () => {
      const future = new Date();
      future.setDate(future.getDate() + 10);
      const result = evaluateReplacement(future, 90, 500, "vida_util");
      assert.ok(result.daysUsed >= 0);
    });

    it("chargeAmount se redondea a 2 decimales", () => {
      const result = evaluateReplacement(daysAgo(1), 3, 10, "extravio");
      const decimals = result.chargeAmount.toString().split(".")[1]?.length ?? 0;
      assert.ok(decimals <= 2, `chargeAmount tiene mas de 2 decimales: ${result.chargeAmount}`);
    });
  });
});

describe("getStockStatus", () => {
  it("empty cuando stock es 0", () => assert.equal(getStockStatus(0, 5), "empty"));
  it("low cuando stock <= minStock", () => assert.equal(getStockStatus(3, 5), "low"));
  it("low cuando stock == minStock", () => assert.equal(getStockStatus(5, 5), "low"));
  it("ok cuando stock > minStock", () => assert.equal(getStockStatus(6, 5), "ok"));
});

describe("calcNextReplacementDate", () => {
  it("la fecha resultado esta en el futuro", () => {
    const date = calcNextReplacementDate(30);
    assert.ok(date > new Date());
  });

  it("la diferencia en dias es aproximadamente la esperada", () => {
    const date = calcNextReplacementDate(30);
    const diff = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    assert.ok(diff >= 29 && diff <= 30, `diferencia inesperada: ${diff} dias`);
  });
});
