import { describe, expect, it } from "vitest";
import { isSixDigitPin, legacyHashPin } from "../lib/pin-utils";

describe("pin utils", () => {
  it("accepts only six numeric digits", () => {
    expect(isSixDigitPin("123456")).toBe(true);
    expect(isSixDigitPin("12345")).toBe(false);
    expect(isSixDigitPin("1234567")).toBe(false);
    expect(isSixDigitPin("12345a")).toBe(false);
  });

  it("keeps the legacy PIN hash deterministic for migrations only", () => {
    expect(legacyHashPin("123456")).toBe(legacyHashPin("123456"));
    expect(legacyHashPin("123456")).not.toBe(legacyHashPin("654321"));
    expect(legacyHashPin("123456")).toMatch(/^pin_[a-z0-9]+_6$/);
  });
});
