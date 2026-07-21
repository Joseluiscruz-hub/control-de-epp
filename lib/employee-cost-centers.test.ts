import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  EMPLOYEE_COST_CENTERS,
  isEmployeeCostCenter,
  normalizeEmployeeCostCenter,
} from "./employee-cost-centers";

describe("employee cost centers", () => {
  test("exposes only the eight approved values in the requested order", () => {
    assert.deepEqual(EMPLOYEE_COST_CENTERS, [
      "PRODUCCIÓN",
      "OPERACIONES",
      "SQE",
      "MANTENIMIENTO",
      "PROCESOS CRÍTICOS",
      "RH",
      "FINANZAS",
      "SINDICATO",
    ]);
  });

  test("normalizes casing and whitespace before validation", () => {
    assert.equal(normalizeEmployeeCostCenter("  procesos   críticos "), "PROCESOS CRÍTICOS");
    assert.equal(isEmployeeCostCenter(" mantenimiento "), true);
  });

  test("rejects values outside the approved list", () => {
    assert.equal(isEmployeeCostCenter("COMPRAS"), false);
    assert.equal(isEmployeeCostCenter(""), false);
  });
});
