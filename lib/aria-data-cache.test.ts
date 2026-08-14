import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getCachedAriaData,
  getOrLoadAriaData,
  invalidateAriaCache,
  setCachedAriaData,
  type AriaRawData,
} from "./aria-data-cache";

function sampleData(label: string): AriaRawData {
  return {
    inventory: [{ id: `inv-${label}`, data: { name: label } }],
    employees: [],
    assignments: [],
    budgetGoal: null,
    assignmentSampleLimited: false,
  };
}

describe("ARIA data cache", () => {
  it("returns cached data while the TTL is fresh and expires after 3 minutes", () => {
    invalidateAriaCache();
    const base = 1_000_000;
    const data = sampleData("fresh");
    setCachedAriaData("cuautitlan:2026", data, base);

    assert.equal(getCachedAriaData("cuautitlan:2026", base + 179_000), data);
    assert.equal(getCachedAriaData("cuautitlan:2026", base + 181_000), null);
  });

  it("isolates cached data by scope key", () => {
    invalidateAriaCache();
    const cuautitlan = sampleData("cuautitlan");
    const toluca = sampleData("toluca");
    setCachedAriaData("cuautitlan:2026", cuautitlan);
    setCachedAriaData("toluca:2026", toluca);

    assert.equal(getCachedAriaData("cuautitlan:2026"), cuautitlan);
    assert.equal(getCachedAriaData("toluca:2026"), toluca);
  });

  it("coalesces concurrent cache misses into a single loader call", async () => {
    invalidateAriaCache();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const loader = async () => {
      calls += 1;
      await gate;
      return sampleData("loaded");
    };

    const first = getOrLoadAriaData("nacional:2026", loader);
    const second = getOrLoadAriaData("nacional:2026", loader);
    assert.equal(calls, 1);

    release();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a, b);
    assert.equal(calls, 1);
  });
});
