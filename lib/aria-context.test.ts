import assert from "node:assert/strict";
import test from "node:test";
import { buildAriaOperationalContext } from "./aria-context";

test("calcula cobertura, compra sugerida y presupuesto", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");
  const context = buildAriaOperationalContext({
    scope: "cuautitlan",
    now,
    inventory: [{
      id: "guante",
      data: { name: "Guante", sku: "G-1", stock: 10, minStock: 5, unitCost: 20, plantaId: "cuautitlan" },
    }],
    employees: [{ id: "1", data: { area: "Produccion" } }],
    assignments: Array.from({ length: 18 }, (_, index) => ({
      id: String(index),
      data: {
        itemId: "guante",
        sku: "G-1",
        itemName: "Guante",
        area: "Produccion",
        quantity: 1,
        unitCost: 20,
        assignedAt: new Date(now.getTime() - index * 4 * 24 * 60 * 60 * 1000),
        status: "active",
      },
    })),
    budgetGoal: { annualLimit: 1000, alertThresholds: [80, 100] },
  });

  assert.equal(context.consumptionByItem[0].quantity90, 18);
  assert.equal(context.consumptionByItem[0].daysCoverage, 50);
  assert.equal(context.purchaseSuggestions[0].reorderQuantity60, 7);
  assert.equal(context.budget?.totalSpent, 360);
  assert.equal(context.budget?.utilizationPct, 36);
});

test("marca gasto parcial cuando la muestra alcanzo el limite", () => {
  const context = buildAriaOperationalContext({
    scope: "nacional",
    inventory: [],
    employees: [],
    assignments: [],
    budgetGoal: { annualLimit: 1000 },
    assignmentSampleLimited: true,
  });

  assert.equal(context.dataQuality.assignmentSampleLimited, true);
  assert.equal(context.budget?.totalSpent, null);
  assert.equal(context.budget?.complete, false);
});

test("no presenta presupuesto consolidado si faltan costos", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");
  const context = buildAriaOperationalContext({
    scope: "toluca",
    now,
    inventory: [],
    employees: [],
    assignments: [{
      id: "sin-costo",
      data: { itemId: "casco", assignedAt: now, quantity: 1, status: "active" },
    }],
    budgetGoal: { annualLimit: 1000 },
  });

  assert.equal(context.dataQuality.unpricedYearlyAssignments, 1);
  assert.equal(context.budget?.totalSpent, null);
  assert.equal(context.budget?.sampledSpent, 0);
});
