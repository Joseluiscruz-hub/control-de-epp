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
import { isSixDigitPin } from "@/lib/pin-utils";

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
    const body = await req.json();
    const employeeId = typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
    const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

    if (!employeeId || !isSixDigitPin(pin)) {
      return Response.json({ error: "Empleado y PIN de 6 digitos requeridos." }, { status: 400 });
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
    const pinHash = await bcrypt.hash(pin, 12);

    try {
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(employeeRef);
        if (!snapshot.exists) {
          throw new KioskPinError("Empleado no encontrado en kiosko.", 404);
        }

        const employee = snapshot.data() ?? {};
        if (employee.active !== true) {
          throw new KioskPinError("Empleado inactivo para kiosko.", 403);
        }

        if (employee.firstLogin === false && typeof employee.pin === "string" && employee.pin.length > 0) {
          throw new KioskPinError("El PIN ya fue configurado.", 409);
        }

        transaction.update(employeeRef, {
          pin: pinHash,
          firstLogin: false,
          termsAccepted: true,
          termsAcceptedAt: FieldValue.serverTimestamp(),
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

    await clearKioskPinFailures(db, attemptKey);

    return Response.json({ success: true });
  } catch (error) {
    console.error("[Kiosk PIN setup error]:", error);
    return Response.json({ error: "No se pudo configurar el PIN." }, { status: 500 });
  }
}
