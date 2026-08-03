import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import {
  KIOSK_DEVICE_COOKIE,
  KIOSK_SESSION_COOKIE,
  KioskSessionHttpError,
  hashKioskDeviceId,
  requireKioskSession,
  signKioskSessionId,
  verifyKioskSessionToken,
} from "./kiosk-session-server";

process.env.KIOSK_SESSION_SECRET = "test-only-kiosk-session-secret-with-32-characters";

function request(sessionToken = "", deviceId = "device-1") {
  return {
    cookies: { get: (name: string) => ({ value: name === KIOSK_SESSION_COOKIE ? sessionToken : name === KIOSK_DEVICE_COOKIE ? deviceId : "" }) },
  } as unknown as NextRequest;
}

function database(session: Record<string, unknown>, employee: Record<string, unknown>) {
  const setCalls: unknown[] = [];
  const db = {
    collection(name: string) {
      return {
        doc() {
          return {
            async get() {
              const data = name === "kiosk_sessions" ? session : employee;
              return { exists: Boolean(data), data: () => data };
            },
            async set(value: unknown) { setCalls.push(value); },
          };
        },
      };
    },
  } as unknown as Firestore;
  return { db, setCalls };
}

function validRecord(overrides: Record<string, unknown> = {}) {
  return {
    employeeId: "1001",
    employeeName: "Persona Demo",
    plantId: "toluca",
    deviceIdHash: hashKioskDeviceId("device-1"),
    purpose: "ppe-kiosk",
    credentialVersion: 3,
    issuedAt: Date.now() - 1000,
    expiresAt: Date.now() + 60_000,
    revokedAt: null,
    ...overrides,
  };
}

const employee = { active: true, plantaId: "toluca", credentialVersion: 3 };

describe("token de sesion de kiosko", () => {
  it("acepta una firma autentica y rechaza una modificada", () => {
    const token = signKioskSessionId("session-1");
    assert.equal(verifyKioskSessionToken(token), "session-1");
    assert.equal(verifyKioskSessionToken(`${token}x`), null);
  });

  it("rechaza una solicitud sin cookie", async () => {
    const { db } = database(validRecord(), employee);
    await assert.rejects(() => requireKioskSession(request(""), db), (error: unknown) => error instanceof KioskSessionHttpError && error.status === 401);
  });

  for (const [name, overrides] of [
    ["expirada", { expiresAt: Date.now() - 1 }],
    ["revocada", { revokedAt: true }],
    ["con proposito diferente", { purpose: "admin" }],
    ["de otro dispositivo", { deviceIdHash: hashKioskDeviceId("other") }],
  ] as const) {
    it(`rechaza una sesion ${name}`, async () => {
      const { db } = database(validRecord(overrides), employee);
      await assert.rejects(() => requireKioskSession(request(signKioskSessionId("session-1")), db), KioskSessionHttpError);
    });
  }

  it("rechaza si cambia la planta del colaborador", async () => {
    const { db } = database(validRecord(), { ...employee, plantaId: "cuautitlan" });
    await assert.rejects(() => requireKioskSession(request(signKioskSessionId("session-1")), db), (error: unknown) => error instanceof KioskSessionHttpError && error.status === 403);
  });

  it("acepta una sesion vigente y registra actividad", async () => {
    const { db, setCalls } = database(validRecord(), employee);
    const claims = await requireKioskSession(request(signKioskSessionId("session-1")), db);
    assert.equal(claims.employeeId, "1001");
    assert.equal(claims.plantId, "toluca");
    assert.equal(setCalls.length, 1);
  });
});
