import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPortalEmployeeResponse } from "./portal-employee-response";

describe("buildPortalEmployeeResponse", () => {
  it("incluye active true para colaboradores validos del portal", () => {
    assert.deepEqual(
      buildPortalEmployeeResponse("3389758", {
        active: true,
        name: "Jose Luis Cruz Prieto",
        area: "OPERACIONES",
        plantaId: "cuautitlan",
      }),
      {
        id: "3389758",
        active: true,
        name: "Jose Luis Cruz Prieto",
        area: "OPERACIONES",
        plantaId: "cuautitlan",
      }
    );
  });

  it("rechaza colaboradores inactivos o sin bandera activa", () => {
    assert.equal(buildPortalEmployeeResponse("3389758", { active: false, name: "Jose" }), null);
    assert.equal(buildPortalEmployeeResponse("3389758", { name: "Jose" }), null);
  });
});
