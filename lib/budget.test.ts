import assert from "node:assert/strict";
import test from "node:test";
import { calculateBudgetMetrics, normalizeBudgetGoalInput } from "./budget";

test("normaliza una meta con umbrales predeterminados", () => {
  assert.deepEqual(normalizeBudgetGoalInput({
    plantaId: "cuautitlan",
    year: 2026,
    annualLimit: 850000,
    monthlyLimits: { "1": 75000, "2": 65000 },
  }), {
    plantaId: "cuautitlan",
    year: 2026,
    annualLimit: 850000,
    monthlyLimits: { "1": 75000, "2": 65000 },
    alertThresholds: [80, 100],
    currency: "MXN",
  });
});

test("calcula disponibilidad y alertas sin limitar el porcentaje real", () => {
  const metrics = calculateBudgetMetrics(
    { annualLimit: 1000, alertThresholds: [80, 100] },
    { totalSpent: 1125 }
  );

  assert.equal(metrics.pctUsed, 112.5);
  assert.equal(metrics.available, 0);
  assert.deepEqual(metrics.alerts.map((alert) => alert.triggered), [true, true]);
});
