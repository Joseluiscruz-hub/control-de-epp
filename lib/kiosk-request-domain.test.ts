import assert from "node:assert/strict";
import test from "node:test";
import {
  KioskRequestError,
  assertUniqueRequestItems,
  isValidRequestItemShape,
  normalizeFulfillableItems,
} from "./kiosk-request-domain";

const validItem = {
  itemId: "casco-msa",
  itemName: "Casco MSA",
  sku: "M2303541AR",
  size: "N/A",
  replacementDays: 365,
};

test("accepts the strict public request item shape", () => {
  assert.equal(isValidRequestItemShape({ itemId: "casco-msa", size: "N/A" }), true);
  assert.equal(
    isValidRequestItemShape({ itemId: "casco-msa", unexpected: true }),
    false
  );
});

test("rejects duplicate item and size combinations", () => {
  assert.throws(
    () => assertUniqueRequestItems([
      { itemId: "guante", size: "M" },
      { itemId: "guante", size: "M" },
    ]),
    (error: unknown) => (
      error instanceof KioskRequestError &&
      error.status === 400 &&
      /mismo EPP y talla/.test(error.message)
    )
  );
});

test("allows the same item with different sizes", () => {
  assert.doesNotThrow(() => assertUniqueRequestItems([
    { itemId: "guante", size: "M" },
    { itemId: "guante", size: "L" },
  ]));
});

test("rejects the whole stored request when one item is malformed", () => {
  assert.throws(
    () => normalizeFulfillableItems([
      validItem,
      { itemId: "lentes", itemName: "", sku: "LENTES", replacementDays: 180 },
    ]),
    (error: unknown) => error instanceof KioskRequestError && error.status === 409
  );
});

test("rejects duplicated stored items before stock is mutated", () => {
  assert.throws(
    () => normalizeFulfillableItems([validItem, { ...validItem }]),
    (error: unknown) => error instanceof KioskRequestError && error.status === 409
  );
});

test("normalizes trusted fulfillment fields without dropping the request", () => {
  const [item] = normalizeFulfillableItems([{
    ...validItem,
    replacementReason: "extravio",
    chargeAmount: 125.5,
    signatureDataUrl: "data:image/png;base64,AAAA",
    durationRuleSapMaterial: null,
  }]);

  assert.equal(item.replacementReason, "extravio");
  assert.equal(item.chargeAmount, 125.5);
  assert.equal(item.signatureDataUrl, "data:image/png;base64,AAAA");
  assert.equal(item.durationRuleSapMaterial, null);
});
