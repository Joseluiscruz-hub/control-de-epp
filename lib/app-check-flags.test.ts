import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseBooleanFlag,
  resolveAppCheckRequired,
  shouldInitializeAppCheck,
} from "./app-check-flags";

describe("app-check-flags", () => {
  it("parses accepted boolean flag values", () => {
    assert.equal(parseBooleanFlag("true"), true);
    assert.equal(parseBooleanFlag("1"), true);
    assert.equal(parseBooleanFlag("ON"), true);
    assert.equal(parseBooleanFlag("false"), false);
    assert.equal(parseBooleanFlag("0"), false);
    assert.equal(parseBooleanFlag("off"), false);
    assert.equal(parseBooleanFlag(""), undefined);
    assert.equal(parseBooleanFlag("maybe"), undefined);
  });

  it("resolves runtime value before client env and fallback", () => {
    assert.equal(resolveAppCheckRequired(false, "true", true), false);
    assert.equal(resolveAppCheckRequired(undefined, "false", true), false);
    assert.equal(resolveAppCheckRequired(undefined, undefined, true), true);
  });

  it("does not initialize App Check from the production fallback alone", () => {
    assert.equal(shouldInitializeAppCheck(undefined, undefined), false);
    assert.equal(shouldInitializeAppCheck(false, "true"), false);
    assert.equal(shouldInitializeAppCheck(undefined, "false"), false);
    assert.equal(shouldInitializeAppCheck(true, undefined), true);
    assert.equal(shouldInitializeAppCheck(undefined, "true"), true);
  });
});
