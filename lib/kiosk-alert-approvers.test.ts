import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildProvisionedKioskAlertApproverProfile,
  buildKioskApprovalActor,
  canApproveKioskAlert,
  findKioskAlertApproverByEmail,
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
      "5680899",
    ]);
  });

  it("resuelve aprobador por correo y excluye usuarios no autorizados", () => {
    assert.equal(findKioskAlertApproverByEmail("JULIOCESAR.VAZQUEZM@KOF.COM")?.employeeId, "1013135");
    assert.equal(findKioskAlertApproverByEmail("angel.bautista@example.com"), null);
  });

  it("construye perfil admin local para auto-provisionar aprobadores por correo", () => {
    assert.deepEqual(
      buildProvisionedKioskAlertApproverProfile("uid-1013135", "juliocesar.vazquezm@kof.com"),
      {
        uid: "uid-1013135",
        email: "juliocesar.vazquezm@kof.com",
        role: "admin_local",
        plantaId: "cuautitlan",
        displayName: "Julio Cesar Vazquez Morlan",
        employeeId: "1013135",
        permissions: {
          canApproveKioskRequests: true,
          canApproveKioskAlerts: true,
        },
        active: true,
      }
    );
  });
});
