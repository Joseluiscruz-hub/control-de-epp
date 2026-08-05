import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isInsecureKioskLocalAuthEnabled } from "./kiosk-local-auth-policy";

describe("politica de autenticacion local insegura", () => {
  it("permite el fallback solo cuando se habilita fuera de produccion", () => {
    assert.equal(isInsecureKioskLocalAuthEnabled("development", "true"), true);
    assert.equal(isInsecureKioskLocalAuthEnabled("test", "true"), true);
  });

  it("lo bloquea siempre en produccion aunque la variable este habilitada", () => {
    assert.equal(isInsecureKioskLocalAuthEnabled("production", "true"), false);
  });

  it("lo mantiene deshabilitado cuando la variable no es true", () => {
    assert.equal(isInsecureKioskLocalAuthEnabled("development", "false"), false);
    assert.equal(isInsecureKioskLocalAuthEnabled("development", undefined), false);
  });
});
