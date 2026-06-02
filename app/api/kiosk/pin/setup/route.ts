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
import { isSixDigitPin, isWeakPin } from "@/lib/pin-utils";

export const runtime = "nodejs";

class KioskPinError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "KioskPinError";
    this.status = status;
  }
}

async function registerFailure(db: ReturnType<typeof getAdminDb>, employeeKey: string, clientKey: string) {
  const [employeeStatus, clientStatus] = await Promise.all([
    registerKioskPinFailure(db, employeeKey, "setup", "employee"),
    registerKioskPinFailure(db, clientKey, "setup", "client"),
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
      return Response.json({ error: "Empleado y PIN de 6 digitos requeridos." }, { status: 400 });
    }
    if (isWeakPin(pin)) {
      return Response.json({ error: "Elige un PIN menos predecible." }, { status: 400 });
    }

    const db = getAdminDb();
    const attemptKey = getKioskPinRateLimitKey(req, employeeId, "setup");
    const clientAttemptKey = getKioskPinClientRateLimitKey(req, "setup");
    const [rateLimit, clientRateLimit] = await Promise.all([
      assertKioskPinRateLimit(db, attemptKey, "employee"),
      assertKioskPinRateLimit(db, clientAttemptKey, "client"),
    ]);
    if (rateLimit.blocked) return kioskPinRateLimitResponse(rateLimit);
    if (clientRateLimit.blocked) return kioskPinRateLimitResponse(clientRateLimit);

    const employeeRef = db.collection("kiosk_employees").doc(employeeId);
    const secretRef = db.collection("kiosk_employee_secrets").doc(employeeId);
    const pinHash = await bcrypt.hash(pin, 12);

    try {
      await db.runTransaction(async (transaction) => {
        const [snapshot, secretSnapshot] = await Promise.all([
          transaction.get(employeeRef),
          transaction.get(secretRef),
        ]);
        if (!snapshot.exists) {
          throw new KioskPinError("Empleado no encontrado en kiosko.", 404);
        }

        const employee = snapshot.data() ?? {};
        const secret = secretSnapshot.data() ?? {};
        if (employee.active !== true) {
          throw new KioskPinError("Empleado inactivo para kiosko.", 403);
        }

        const existingPinHash = typeof secret.pinHash === "string" ? secret.pinHash : "";
        if (employee.firstLogin === false && existingPinHash.length > 0) {
          throw new KioskPinError("El PIN ya fue configurado.", 409);
        }

        transaction.set(secretRef, {
          pinHash,
          pinVersion: 2,
          lastPinChangeAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ...(secretSnapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        }, { merge: true });
        transaction.update(employeeRef, {
          firstLogin: false,
          termsAccepted: true,
          termsAcceptedAt: FieldValue.serverTimestamp(),
          pin: FieldValue.delete(),
          pinVersion: FieldValue.delete(),
          lastPinChangeAt: FieldValue.delete(),
          legacyPinMigratedAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    } catch (error) {
      if (error instanceof KioskPinError) {
        const nextRateLimit = await registerFailure(db, attemptKey, clientAttemptKey);
        if (nextRateLimit.blocked) return kioskPinRateLimitResponse(nextRateLimit);
        return Response.json({ error: error.message }, { status: error.status });
      }

      throw error;
    }

    await Promise.all([
      clearKioskPinFailures(db, attemptKey),
      clearKioskPinFailures(db, clientAttemptKey),
      db.collection("audit_events").add(buildAuditEvent({
        type: "kiosk.pin.setup",
        targetCollection: "kiosk_employee_secrets",
        targetId: employeeId,
        metadata: { source: "kiosk", pinVersion: 2 },
      }, req)),
    ]);

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof AppCheckHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[Kiosk PIN setup error]:", error);
    return Response.json({ error: "No se pudo configurar el PIN." }, { status: 500 });
  }
}
