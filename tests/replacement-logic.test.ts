import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateReplacement, getStockStatus } from "../lib/replacement-logic";

describe("replacement logic", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates proportional payroll charge for loss before end of life", () => {
    const result = evaluateReplacement(new Date("2026-04-25T12:00:00.000Z"), 60, 1000, "extravio");

    expect(result.daysUsed).toBe(30);
    expect(result.daysRemaining).toBe(30);
    expect(result.lifeUsedPct).toBe(50);
    expect(result.isEligibleFree).toBe(false);
    expect(result.chargeAmount).toBe(500);
    expect(result.chargeDescription).toContain("30 días restantes");
  });

  it("does not charge when the useful life is already completed", () => {
    const result = evaluateReplacement(new Date("2026-03-26T12:00:00.000Z"), 60, 1000, "extravio");

    expect(result.daysUsed).toBe(60);
    expect(result.daysRemaining).toBe(0);
    expect(result.isEligibleFree).toBe(true);
    expect(result.chargeAmount).toBe(0);
  });

  it("classifies stock status", () => {
    expect(getStockStatus(0, 3)).toBe("empty");
    expect(getStockStatus(2, 3)).toBe("low");
    expect(getStockStatus(4, 3)).toBe("ok");
  });
});
