import bcrypt from "bcryptjs";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { AppCheckHttpError, requireAppCheck } from "@/lib/app-check";
import { buildAuditEvent } from "@/lib/audit-events";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  assertKioskPinRateLimit,
  clearKioskPinFailures,
  getKioskPinClientRateLimitKey,
  getKioskPinRateLimitKey,
  kioskPinRateLimitResponse,
  registerKioskPinFailure,
} from "@/lib/kiosk-pin-rate-limit";
import { isSixDigitPin, legacyHashPin } from "@/lib/pin-utils";
import { attachKioskSessionCookies, createKioskSession } from "@/lib/kiosk-session-server";

export const runtime = "nodejs";

async function comparePin(pin: string, storedPin: string) {
  if (storedPin.startsWith("$2a$") || storedPin.startsWith("$2b$") || storedPin.startsWith("$2y$")) {
    return bcrypt.compare(pin, storedPin);
  }

  return storedPin === legacyHashPin(pin);
}

async function registerFailure(db: ReturnType<typeof getAdminDb>, employeeKey: string, clientKey: string) {
  const [employeeStatus, clientStatus] = await Promise.all([
    registerKioskPinFailure(db, employeeKey, "verify", "employee"),
    registerKioskPinFailure(db, clientKey, "verify", "client"),
  ]);
  return employeeStatus.blocked ? employeeStatus : clientStatus;
}

export async function POST(req: NextRequest) {
  try {
    await requireAppCheck(req);

    const body = await req.json();
    const employeeId = typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
    const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

    if (!employeeId || !isSixDigitPin(pin)) {
      return Response.json({ valid: false, error: "No fue posible validar las credenciales." }, { status: 400 });
    }

    const db = getAdminDb();
    const attemptKey = getKioskPinRateLimitKey(req, employeeId, "verify");
    const clientAttemptKey = getKioskPinClientRateLimitKey(req, "verify");
    const [rateLimit, clientRateLimit] = await Promise.all([
      assertKioskPinRateLimit(db, attemptKey, "employee"),
      assertKioskPinRateLimit(db, clientAttemptKey, "client"),
    ]);
    if (rateLimit.blocked) return kioskPinRateLimitResponse(rateLimit, true);
    if (clientRateLimit.blocked) return kioskPinRateLimitResponse(clientRateLimit, true);

    const employeeRef = db.collection("kiosk_employees").doc(employeeId);
    const secretRef = db.collection("kiosk_employee_secrets").doc(employeeId);
    const [snapshot, secretSnapshot] = await Promise.all([employeeRef.get(), secretRef.get()]);
    const employee = snapshot.data();
    const secret = secretSnapshot.data();
    const storedSecretPin = typeof secret?.pinHash === "string" ? secret.pinHash : "";
    const storedLegacyPin = typeof employee?.pin === "string" ? employee.pin : "";
    const storedPin = storedSecretPin || storedLegacyPin;

    if (!snapshot.exists || employee?.active !== true || !storedPin) {
      const nextRateLimit = await registerFailure(db, attemptKey, clientAttemptKey);
      if (nextRateLimit.blocked) return kioskPinRateLimitResponse(nextRateLimit, true);
      return Response.json({ valid: false, error: "No fue posible validar las credenciales." }, { status: 401 });
    }

    const valid = await comparePin(pin, storedPin);
    if (!valid) {
      const nextRateLimit = await registerFailure(db, attemptKey, clientAttemptKey);
      if (nextRateLimit.blocked) return kioskPinRateLimitResponse(nextRateLimit, true);
      return Response.json({ valid: false, error: "No fue posible validar las credenciales." }, { status: 401 });
    }

    await Promise.all([
      clearKioskPinFailures(db, attemptKey),
      clearKioskPinFailures(db, clientAttemptKey),
    ]);

    if (!storedSecretPin && storedLegacyPin) {
      const migratedHash = storedLegacyPin.startsWith("$2")
        ? storedLegacyPin
        : await bcrypt.hash(pin, 12);
      await Promise.all([
        secretRef.set({
          pinHash: migratedHash,
          pinVersion: 2,
          legacyPinMigratedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ...(secretSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        }, { merge: true }),
        employeeRef.update({
          pin: FieldValue.delete(),
          pinVersion: FieldValue.delete(),
          lastPinChangeAt: FieldValue.delete(),
          legacyPinMigratedAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }),
        db.collection("audit_events").add(buildAuditEvent({
          type: "kiosk.pin.legacy_migrated",
          targetCollection: "kiosk_employee_secrets",
          targetId: employeeId,
          metadata: { source: "kiosk", pinVersion: 2 },
        }, req)),
      ]);
    }

    const employeeName = typeof employee.name === "string" ? employee.name.trim() : "";
    const plantId = typeof employee.plantaId === "string" ? employee.plantaId.trim() : "";
    if (!employeeName || !plantId) {
      return Response.json({ valid: false, error: "No fue posible validar las credenciales." }, { status: 401 });
    }
    const kioskSession = await createKioskSession({
      req,
      db,
      employeeId,
      employeeName,
      plantId,
      credentialVersion: Number(employee.credentialVersion ?? 1),
    });
    return attachKioskSessionCookies(
      Response.json({ valid: true, expiresAt: kioskSession.claims.expiresAt }),
      kioskSession.token,
      kioskSession.deviceId
    );
  } catch (error) {
    if (error instanceof AppCheckHttpError) {
      return Response.json({ valid: false, error: error.message }, { status: error.status });
    }
    console.error("[Kiosk PIN verify error]:", error);
    return Response.json({ valid: false, error: "No se pudo validar el PIN." }, { status: 500 });
  }
}
