import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildKioskApprovalActor,
  canApproveKioskAlert,
  kioskAlertApproverIdsForPlant,
} from "./kiosk-alert-approvers";
import type { AdminSession } from "./server-auth";

function session(profile: Partial<AdminSession["profile"]>): AdminSession {
  return {
    uid: "uid-1",
    email: "admin@example.com",
    role: "admin_local",
    plantaId: "cuautitlan",
    profile: {
      uid: "uid-1",
      email: "admin@example.com",
      role: "admin_local",
      plantaId: "cuautitlan",
      active: true,
      ...profile,
    },
  };
}

describe("kiosk alert approvers", () => {
  it("autoriza aprobadores configurados de Cuautitlan por employeeId", () => {
    const admin = session({ employeeId: "1013135" });

    assert.equal(canApproveKioskAlert(admin, "cuautitlan"), true);
    assert.equal(buildKioskApprovalActor(admin, "cuautitlan").name, "Julio Cesar Vazquez Morlan");
  });

  it("permite permiso explicito si existe employeeId trazable", () => {
    const admin = session({
      employeeId: "9999999",
      displayName: "Supervisor externo",
      permissions: { canApproveKioskAlerts: true },
    });

    const actor = buildKioskApprovalActor(admin, "toluca");
    assert.equal(canApproveKioskAlert(admin, "toluca"), true);
    assert.equal(actor.permissionSource, "explicit_permission");
    assert.equal(actor.name, "Supervisor externo");
  });

  it("rechaza permisos de alerta sin employeeId trazable", () => {
    const admin = session({ permissions: { canApproveKioskAlerts: true } });

    assert.equal(canApproveKioskAlert(admin, "cuautitlan"), false);
  });

  it("expone la lista configurada por planta", () => {
    assert.deepEqual(kioskAlertApproverIdsForPlant("cuautitlan"), [
      "1013135",
      "5412880",
      "3506166",
      "5839977",
      "5680899",
    ]);
  });
});
