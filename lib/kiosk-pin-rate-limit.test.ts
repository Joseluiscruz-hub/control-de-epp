import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextRequest } from "next/server";
import {
  getKioskPinClientRateLimitKey,
  getKioskPinRateLimitKey,
  kioskPinRateLimitResponse,
} from "./kiosk-pin-rate-limit";

function makeRequest(ip: string, forwardedFor?: string): NextRequest {
  const headers = new Headers();
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  else headers.set("x-real-ip", ip);
  return { headers } as unknown as NextRequest;
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

  it("prefiere x-forwarded-for sobre x-real-ip", () => {
    const forwarded = makeRequest("10.0.0.99", "203.0.113.1, 10.0.0.1");
    const direct = makeRequest("10.0.0.99");
    const forwardedKey = getKioskPinRateLimitKey(forwarded, "EMP001", "verify");
    const directKey = getKioskPinRateLimitKey(direct, "EMP001", "verify");
    assert.notEqual(forwardedKey, directKey);
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
});

describe("kioskPinRateLimitResponse", () => {
  it("devuelve status 429", () => {
    const response = kioskPinRateLimitResponse({ blocked: true, retryAfterSeconds: 60, remainingAttempts: 0 });
    assert.equal(response.status, 429);
  });

  it("incluye header Retry-After", () => {
    const response = kioskPinRateLimitResponse({ blocked: true, retryAfterSeconds: 60, remainingAttempts: 0 });
    assert.equal(response.headers.get("Retry-After"), "60");
  });

  it("incluye campo valid:false cuando se solicita", async () => {
    const response = kioskPinRateLimitResponse(
      { blocked: true, retryAfterSeconds: 30, remainingAttempts: 0 },
      true
    );
    const body = await response.json();
    assert.equal(body.valid, false);
  });

  it("usa minimo 1 segundo aunque retryAfterSeconds sea 0", async () => {
    const response = kioskPinRateLimitResponse({ blocked: true, retryAfterSeconds: 0, remainingAttempts: 0 });
    const body = await response.json();
    assert.equal(response.headers.get("Retry-After"), "1");
    assert.ok(body.retryAfterSeconds >= 1);
  });
});
