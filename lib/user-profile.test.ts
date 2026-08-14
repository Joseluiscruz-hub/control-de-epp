import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PLANT_ID, PLANTS } from "./plants";
import {
  buildBootstrapAdminProfile,
  isConfiguredBootstrapAdminEmail,
  normalizeUserProfile,
} from "./user-profile";

describe("normalizeUserProfile", () => {
  it("rechaza roles desconocidos", () => {
    assert.equal(normalizeUserProfile("u1", "admin@example.com", { role: "viewer" }), null);
  });

  it("normaliza admin global con alcance nacional por defecto", () => {
    assert.deepEqual(normalizeUserProfile("u1", "admin@example.com", {
      role: "admin_global", plantaId: "planta_invalida", email: "ADMIN@EXAMPLE.COM", displayName: "Admin",
    }), {
      uid: "u1", email: "admin@example.com", role: "admin_global", plantaId: "nacional", displayName: "Admin", active: true,
    });
  });

  it("normaliza admin local con planta valida y conserva cuentas desactivadas", () => {
    assert.deepEqual(normalizeUserProfile("u2", "local@example.com", {
      role: "admin_local", plantaId: "toluca", active: false,
    }), {
      uid: "u2", email: "local@example.com", role: "admin_local", plantaId: "toluca", displayName: undefined, active: false,
    });
  });

  it("usa DEFAULT_PLANT_ID cuando plantaId de Firestore es invalido", () => {
    assert.equal(normalizeUserProfile("u3", "local@example.com", {
      role: "admin_local", plantaId: "monterrey",
    })?.plantaId, DEFAULT_PLANT_ID);
  });

  it("acepta todas las plantas definidas en PLANTS", () => {
    for (const plant of PLANTS) {
      assert.equal(normalizeUserProfile("uid-1", "test@example.com", {
        role: "admin_local", plantaId: plant.id, active: true,
      })?.plantaId, plant.id);
    }
  });

  it("normaliza identidad operativa y permisos administrativos", () => {
    assert.deepEqual(normalizeUserProfile("u4", "local@example.com", {
      role: "admin_local", plantaId: "cuautitlan", employeeId: "1013135",
      permissions: { canApproveKioskRequests: true, canApproveKioskAlerts: true, unexpected: true },
    }), {
      uid: "u4", email: "local@example.com", role: "admin_local", plantaId: "cuautitlan", displayName: undefined,
      employeeId: "1013135", permissions: { canApproveKioskRequests: true, canApproveKioskAlerts: true }, active: true,
    });
  });

  it("descarta employeeId invalido y permisos falsos", () => {
    assert.deepEqual(normalizeUserProfile("u5", "local@example.com", {
      role: "admin_local", plantaId: "cuautitlan", employeeId: "ABC-123", permissions: { canApproveKioskAlerts: false },
    }), {
      uid: "u5", email: "local@example.com", role: "admin_local", plantaId: "cuautitlan", displayName: undefined, active: true,
    });
  });
});

describe("bootstrap admin", () => {
  it("solo autoriza el email configurado cuando la bandera esta activa", () => {
    const config = { enabled: true, email: "rescate@example.com" };
    assert.equal(isConfiguredBootstrapAdminEmail("RESCATE@example.com", config), true);
    assert.equal(isConfiguredBootstrapAdminEmail("otro@example.com", config), false);
    assert.equal(isConfiguredBootstrapAdminEmail("rescate@example.com", { ...config, enabled: false }), false);
  });

  it("construye perfil global temporal sin exponer configuracion al cliente", () => {
    assert.deepEqual(buildBootstrapAdminProfile(
      { uid: "uid-1", email: "RESCATE@example.com", displayName: "Rescate" },
      { enabled: true, email: "rescate@example.com" }
    ), {
      uid: "uid-1", email: "rescate@example.com", role: "admin_global", plantaId: "nacional", displayName: "Rescate", active: true,
    });
  });
});
