import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextRequest } from "next/server";
import {
  attachKioskPinClientCookie,
  getKioskPinClientRateLimitKey,
  getKioskPinRateLimitKey,
  getKioskPinRateLimitStatus,
  KIOSK_PIN_CLIENT_COOKIE,
  kioskPinRateLimitResponse,
  selectKioskPinPrecheckBlock,
} from "./kiosk-pin-rate-limit";

function makeRequest(ip: string, forwardedFor?: string, clientId = ""): NextRequest {
  const headers = new Headers();
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  else headers.set("x-real-ip", ip);
  return {
    headers,
    cookies: {
      get: (name: string) => name === KIOSK_PIN_CLIENT_COOKIE && clientId ? { value: clientId } : undefined,
    },
  } as unknown as NextRequest;
}

describe("getKioskPinRateLimitKey", () => {
  it("devuelve string con prefijo employee_", () => {
    const req = makeRequest("192.168.1.1");
    const key = getKioskPinRateLimitKey(req, "EMP001", "verify");
    assert.ok(key.startsWith("employee_"), `key inesperada: ${key}`);
  });

  it("es deterministico: misma entrada = misma key", () => {
    const req = makeRequest("10.0.0.1");
    const first = getKioskPinRateLimitKey(req, "EMP001", "verify");
    const second = getKioskPinRateLimitKey(req, "EMP001", "verify");
    assert.equal(first, second);
  });

  it("cambia con diferente employeeId", () => {
    const req = makeRequest("10.0.0.1");
    const first = getKioskPinRateLimitKey(req, "EMP001", "verify");
    const second = getKioskPinRateLimitKey(req, "EMP002", "verify");
    assert.notEqual(first, second);
  });

  it("cambia con diferente scope", () => {
    const req = makeRequest("10.0.0.1");
    const setup = getKioskPinRateLimitKey(req, "EMP001", "setup");
    const verify = getKioskPinRateLimitKey(req, "EMP001", "verify");
    assert.notEqual(setup, verify);
  });

  it("normaliza employeeId a minusculas", () => {
    const req = makeRequest("10.0.0.1");
    const upper = getKioskPinRateLimitKey(req, "EMP001", "verify");
    const lower = getKioskPinRateLimitKey(req, "emp001", "verify");
    assert.equal(upper, lower);
  });

  it("no permite evadir el limite del empleado cambiando de IP", () => {
    const forwarded = makeRequest("10.0.0.99", "203.0.113.1, 10.0.0.1");
    const direct = makeRequest("10.0.0.99");
    const forwardedKey = getKioskPinRateLimitKey(forwarded, "EMP001", "verify");
    const directKey = getKioskPinRateLimitKey(direct, "EMP001", "verify");
    assert.equal(forwardedKey, directKey);
  });
});

describe("getKioskPinClientRateLimitKey", () => {
  it("devuelve string con prefijo client_", () => {
    const req = makeRequest("192.168.1.1");
    const key = getKioskPinClientRateLimitKey(req, "verify");
    assert.ok(key.startsWith("client_"), `key inesperada: ${key}`);
  });

  it("es diferente de la employee key para el mismo IP", () => {
    const req = makeRequest("10.0.0.1");
    const employeeKey = getKioskPinRateLimitKey(req, "EMP001", "verify");
    const clientKey = getKioskPinClientRateLimitKey(req, "verify");
    assert.notEqual(employeeKey, clientKey);
  });

  it("aísla dos dispositivos que comparten la misma IP", () => {
    const first = makeRequest("10.0.0.1", undefined, "device_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    const second = makeRequest("10.0.0.1", undefined, "device_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB");
    assert.notEqual(
      getKioskPinClientRateLimitKey(first, "verify"),
      getKioskPinClientRateLimitKey(second, "verify")
    );
  });

  it("mantiene la misma key para el mismo dispositivo e IP", () => {
    const first = makeRequest("10.0.0.1", undefined, "device_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    const second = makeRequest("10.0.0.1", undefined, "device_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    assert.equal(
      getKioskPinClientRateLimitKey(first, "verify"),
      getKioskPinClientRateLimitKey(second, "verify")
    );
  });
});

describe("attachKioskPinClientCookie", () => {
  it("emite un identificador persistente y HttpOnly cuando el dispositivo no tiene uno", () => {
    const response = attachKioskPinClientCookie(makeRequest("10.0.0.1"), Response.json({ ok: true }));
    const value = response.headers.get("set-cookie") ?? "";
    assert.match(value, new RegExp(`^${KIOSK_PIN_CLIENT_COOKIE}=`));
    assert.match(value, /HttpOnly/);
    assert.match(value, /SameSite=Strict/);
    assert.match(value, /Max-Age=2592000/);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  it("no reemplaza el identificador existente", () => {
    const request = makeRequest("10.0.0.1", undefined, "device_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    const response = attachKioskPinClientCookie(request, Response.json({ ok: true }));
    assert.equal(response.headers.get("set-cookie"), null);
  });
});

describe("kioskPinRateLimitResponse", () => {
  it("devuelve status 429", () => {
    const response = kioskPinRateLimitResponse({ blocked: true, adminUnlockRequired: false, retryAfterSeconds: 60, remainingAttempts: 0 });
    assert.equal(response.status, 429);
  });

  it("incluye header Retry-After", () => {
    const response = kioskPinRateLimitResponse({ blocked: true, adminUnlockRequired: false, retryAfterSeconds: 60, remainingAttempts: 0 });
    assert.equal(response.headers.get("Retry-After"), "60");
  });

  it("incluye campo valid:false cuando se solicita", async () => {
    const response = kioskPinRateLimitResponse(
      { blocked: true, adminUnlockRequired: false, retryAfterSeconds: 30, remainingAttempts: 0 },
      true
    );
    const body = await response.json();
    assert.equal(body.valid, false);
  });

  it("usa minimo 1 segundo aunque retryAfterSeconds sea 0", async () => {
    const response = kioskPinRateLimitResponse({ blocked: true, adminUnlockRequired: false, retryAfterSeconds: 0, remainingAttempts: 0 });
    const body = await response.json();
    assert.equal(response.headers.get("Retry-After"), "1");
    assert.ok(body.retryAfterSeconds >= 1);
  });
});

describe("selectKioskPinPrecheckBlock", () => {
  const allowed = { blocked: false, adminUnlockRequired: false, retryAfterSeconds: 0, remainingAttempts: 15 };
  const blocked = { blocked: true, adminUnlockRequired: false, retryAfterSeconds: 600, remainingAttempts: 0 };

  it("no hereda el bloqueo compartido antes de comprobar una credencial", () => {
    assert.equal(selectKioskPinPrecheckBlock(allowed, blocked), null);
  });

  it("mantiene el bloqueo individual del empleado", () => {
    assert.equal(selectKioskPinPrecheckBlock(blocked, allowed), blocked);
  });
});

describe("bloqueo progresivo de PIN", () => {
  it("bloquea cinco minutos al quinto fallo", () => {
    const now = Date.now();
    const status = getKioskPinRateLimitStatus({ failedAttempts: 5, windowExpiresAt: now + 1000, blockedUntil: now + 5 * 60_000 }, "employee", now);
    assert.equal(status.blocked, true);
    assert.equal(status.adminUnlockRequired, false);
    assert.equal(status.retryAfterSeconds, 300);
  });

  it("bloquea treinta minutos al decimo fallo", () => {
    const now = Date.now();
    const status = getKioskPinRateLimitStatus({ failedAttempts: 10, windowExpiresAt: now + 1000, blockedUntil: now + 30 * 60_000 }, "employee", now);
    assert.equal(status.retryAfterSeconds, 1800);
  });

  it("requiere desbloqueo administrativo al fallo quince", async () => {
    const status = getKioskPinRateLimitStatus({ failedAttempts: 15, adminUnlockRequired: true }, "employee");
    assert.equal(status.blocked, true);
    assert.equal(status.adminUnlockRequired, true);
    const response = kioskPinRateLimitResponse(status, true);
    assert.equal(response.status, 423);
    assert.equal((await response.json()).adminUnlockRequired, true);
  });
});
