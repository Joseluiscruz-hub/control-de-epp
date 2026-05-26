import bcrypt from "bcryptjs";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { isSixDigitPin, legacyHashPin } from "@/lib/pin-utils";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function getAttemptKey(req: NextRequest, employeeId: string) {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  return `${forwardedFor || realIp || "unknown"}:${employeeId}`;
}

function assertNotLocked(key: string) {
  const now = Date.now();
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.delete(key);
    return;
  }

  if (current.count >= MAX_ATTEMPTS) {
    const seconds = Math.ceil((current.resetAt - now) / 1000);
    return Response.json(
      { valid: false, error: `Demasiados intentos. Espera ${seconds} segundos.` },
      { status: 429 }
    );
  }
}

function registerFailure(key: string) {
  const now = Date.now();
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  attempts.set(key, { ...current, count: current.count + 1 });
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

    const attemptKey = getAttemptKey(req, employeeId);
    const lockResponse = assertNotLocked(attemptKey);
    if (lockResponse) return lockResponse;

    const employeeRef = getAdminDb().collection("kiosk_employees").doc(employeeId);
    const snapshot = await employeeRef.get();
    const employee = snapshot.data();
    const storedPin = typeof employee?.pin === "string" ? employee.pin : "";

    if (!snapshot.exists || employee?.active !== true || !storedPin) {
      registerFailure(attemptKey);
      return Response.json({ valid: false, error: "PIN incorrecto." }, { status: 401 });
    }

    const valid = await comparePin(pin, storedPin);
    if (!valid) {
      registerFailure(attemptKey);
      return Response.json({ valid: false, error: "PIN incorrecto." }, { status: 401 });
    }

    attempts.delete(attemptKey);

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
