import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { createKioskSessionToken } from "@/lib/kiosk-session-token";
import { isSixDigitPin, legacyHashPin } from "@/lib/pin-utils";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;

function getClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  return forwardedFor || realIp || "unknown";
}

function hashAttemptKey(ip: string, employeeId: string) {
  return createHash("sha256").update(`${ip}:${employeeId}`).digest("hex");
}

function getResetMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  return 0;
}

async function assertNotLocked(attemptRef: DocumentReference) {
  const snapshot = await attemptRef.get();
  if (!snapshot.exists) return;

  const data = snapshot.data() ?? {};
  const resetAt = getResetMillis(data.resetAt);
  const count = typeof data.count === "number" ? data.count : 0;
  const now = Date.now();

  if (resetAt <= now) {
    await attemptRef.delete();
    return;
  }

  if (count >= MAX_ATTEMPTS) {
    const seconds = Math.ceil((resetAt - now) / 1000);
    return Response.json(
      { valid: false, error: `Demasiados intentos. Espera ${seconds} segundos.` },
      { status: 429 }
    );
  }
}

async function registerFailure(attemptRef: DocumentReference, employeeId: string, ipHash: string) {
  const db = getAdminDb();

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(attemptRef);
    const now = Date.now();
    const current = snapshot.data() ?? {};
    const currentResetAt = getResetMillis(current.resetAt);
    const currentCount = typeof current.count === "number" ? current.count : 0;
    const count = !snapshot.exists || currentResetAt <= now ? 1 : currentCount + 1;
    const resetAtMillis = !snapshot.exists || currentResetAt <= now ? now + WINDOW_MS : currentResetAt;

    transaction.set(
      attemptRef,
      {
        count,
        employeeId,
        ipHash,
        resetAt: Timestamp.fromMillis(resetAtMillis),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

async function comparePin(pin: string, storedPin: string) {
  if (storedPin.startsWith("$2a$") || storedPin.startsWith("$2b$") || storedPin.startsWith("$2y$")) {
    return bcrypt.compare(pin, storedPin);
  }

  return storedPin === legacyHashPin(pin);
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
    const ipHash = hashAttemptKey(getClientIp(req), employeeId);
    const attemptRef = db.collection("kiosk_pin_attempts").doc(ipHash);
    const lockResponse = await assertNotLocked(attemptRef);
    if (lockResponse) return lockResponse;

    const employeeRef = db.collection("kiosk_employees").doc(employeeId);
    const snapshot = await employeeRef.get();
    const employee = snapshot.data();
    const storedPin = typeof employee?.pin === "string" ? employee.pin : "";

    if (!snapshot.exists || employee?.active !== true || !storedPin) {
      await registerFailure(attemptRef, employeeId, ipHash);
      return Response.json({ valid: false, error: "PIN incorrecto." }, { status: 401 });
    }

    const valid = await comparePin(pin, storedPin);
    if (!valid) {
      await registerFailure(attemptRef, employeeId, ipHash);
      return Response.json({ valid: false, error: "PIN incorrecto." }, { status: 401 });
    }

    await attemptRef.delete();

    if (!storedPin.startsWith("$2")) {
      const upgradedHash = await bcrypt.hash(pin, 12);
      await employeeRef.update({
        pin: upgradedHash,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return Response.json({
      valid: true,
      sessionToken: createKioskSessionToken({
        employeeId,
        employeeName: typeof employee?.name === "string" ? employee.name : "",
      }),
    });
  } catch (error) {
    console.error("[Kiosk PIN verify error]:", error);
    return Response.json({ valid: false, error: "No se pudo validar el PIN." }, { status: 500 });
  }
}
