import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeEmployeeCredentialResetId } from "./employee-credential-reset";

describe("normalizeEmployeeCredentialResetId", () => {
  it("acepta numeros de socio de hasta 12 digitos", () => {
    assert.equal(normalizeEmployeeCredentialResetId(" 5857810 "), "5857810");
    assert.equal(normalizeEmployeeCredentialResetId("123456789012"), "123456789012");
  });

  it("rechaza entradas no numericas o vacias", () => {
    assert.equal(normalizeEmployeeCredentialResetId(""), "");
    assert.equal(normalizeEmployeeCredentialResetId("585-7810"), "");
    assert.equal(normalizeEmployeeCredentialResetId("socio 5857810"), "");
    assert.equal(normalizeEmployeeCredentialResetId("1234567890123"), "");
    assert.equal(normalizeEmployeeCredentialResetId(null), "");
  });
});
