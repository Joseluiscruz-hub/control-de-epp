import bcrypt from "bcryptjs";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
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
    const body = await req.json();
    const employeeId = typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
    const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

    if (!employeeId || !isSixDigitPin(pin)) {
      return Response.json({ valid: false, error: "Empleado y PIN de 6 digitos requeridos." }, { status: 400 });
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
    const snapshot = await employeeRef.get();
    const employee = snapshot.data();
    const storedPin = typeof employee?.pin === "string" ? employee.pin : "";

    if (!snapshot.exists || employee?.active !== true || !storedPin) {
      const nextRateLimit = await registerFailure(db, attemptKey, clientAttemptKey);
      if (nextRateLimit.blocked) return kioskPinRateLimitResponse(nextRateLimit, true);
      return Response.json({ valid: false, error: "PIN incorrecto." }, { status: 401 });
    }

    const valid = await comparePin(pin, storedPin);
    if (!valid) {
      const nextRateLimit = await registerFailure(db, attemptKey, clientAttemptKey);
      if (nextRateLimit.blocked) return kioskPinRateLimitResponse(nextRateLimit, true);
      return Response.json({ valid: false, error: "PIN incorrecto." }, { status: 401 });
    }

    await clearKioskPinFailures(db, attemptKey);

    if (!storedPin.startsWith("$2")) {
      const upgradedHash = await bcrypt.hash(pin, 12);
      await employeeRef.update({
        pin: upgradedHash,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return Response.json({ valid: true });
  } catch (error) {
    console.error("[Kiosk PIN verify error]:", error);
    return Response.json({ valid: false, error: "No se pudo validar el PIN." }, { status: 500 });
  }
}
