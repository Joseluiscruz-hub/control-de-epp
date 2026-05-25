import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KioskSessionError,
  createKioskSessionToken,
  verifyKioskSessionToken,
} from "../lib/kiosk-session-token";

const ORIGINAL_SECRET = process.env.KIOSK_SESSION_SECRET;

describe("kiosk session token", () => {
  beforeEach(() => {
    process.env.KIOSK_SESSION_SECRET = "test-kiosk-session-secret-32-characters";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-25T12:00:00.000Z"));
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.KIOSK_SESSION_SECRET;
    } else {
      process.env.KIOSK_SESSION_SECRET = ORIGINAL_SECRET;
    }
    vi.useRealTimers();
  });

  it("creates and verifies signed kiosk claims", () => {
    const token = createKioskSessionToken({ employeeId: "1881", employeeName: "JUAN PEREZ" });
    const claims = verifyKioskSessionToken(token);

    expect(claims).toMatchObject({
      employeeId: "1881",
      employeeName: "JUAN PEREZ",
      version: "v1",
    });
    expect(claims.expiresAt).toBeGreaterThan(claims.issuedAt);
  });

  it("rejects tampered tokens", () => {
    const token = createKioskSessionToken({ employeeId: "1881", employeeName: "JUAN PEREZ" });
    const parts = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        employeeId: "9999",
        employeeName: "INTRUSO",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 1000,
        version: "v1",
      }),
      "utf8"
    ).toString("base64url");

    expect(() => verifyKioskSessionToken(`${parts[0]}.${tamperedPayload}.${parts[2]}`)).toThrow(KioskSessionError);
  });

  it("rejects malformed tokens without surfacing parser errors", () => {
    expect(() => verifyKioskSessionToken("v1.not-json.signature")).toThrow(KioskSessionError);
  });

  it("rejects expired tokens", () => {
    const token = createKioskSessionToken({ employeeId: "1881", employeeName: "JUAN PEREZ" });

    vi.setSystemTime(new Date("2026-05-25T15:00:00.000Z"));

    expect(() => verifyKioskSessionToken(token)).toThrow(KioskSessionError);
  });
});
