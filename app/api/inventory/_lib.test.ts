import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInventoryMovement } from "./_lib";

describe("buildInventoryMovement", () => {
  it("omite campos undefined del metadata para Firestore", () => {
    const movement = buildInventoryMovement({
      itemId: "cuautitlan__SKU-1",
      sku: "SKU-1",
      type: "add",
      previousStock: 0,
      newStock: 5,
      source: "admin",
      plantaId: "cuautitlan",
      performedByUid: "admin-1",
      performedByEmail: "admin@example.com",
      metadata: {
        itemName: "Casco",
        stockPackageInput: undefined,
        packageRuleId: undefined,
        unit: "PZA",
      },
    });

    assert.deepEqual(movement.metadata, {
      itemName: "Casco",
      unit: "PZA",
    });
  });
});
