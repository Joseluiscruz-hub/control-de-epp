import bcrypt from "bcryptjs";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { AppCheckHttpError, requireAppCheck } from "@/lib/app-check";
import { buildAuditEvent } from "@/lib/audit-events";
import { getAdminDb } from "@/lib/firebase-admin";
import { KioskSessionHttpError, assertSameOrigin, clearKioskSessionCookies, kioskSessionErrorResponse, requireKioskSession, revokeKioskSession } from "@/lib/kiosk-session-server";
import { isSixDigitPin, isWeakPin } from "@/lib/pin-utils";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireAppCheck(req);
    assertSameOrigin(req);
    const db = getAdminDb();
    const session = await requireKioskSession(req, db);
    const body = await req.json();
    const currentPin = typeof body?.currentPin === "string" ? body.currentPin.trim() : "";
    const newPin = typeof body?.newPin === "string" ? body.newPin.trim() : "";
    if (!isSixDigitPin(currentPin) || !isSixDigitPin(newPin) || isWeakPin(newPin)) {
      return Response.json({ error: "PIN actual y nuevo PIN validos son requeridos." }, { status: 400 });
    }

    const secretRef = db.collection("kiosk_employee_secrets").doc(session.employeeId);
    const employeeRef = db.collection("kiosk_employees").doc(session.employeeId);
    const secretSnapshot = await secretRef.get();
    const storedHash = secretSnapshot.data()?.pinHash;
    if (typeof storedHash !== "string" || !await bcrypt.compare(currentPin, storedHash)) {
      return Response.json({ error: "No fue posible validar las credenciales." }, { status: 401 });
    }

    const newHash = await bcrypt.hash(newPin, 12);
    const nextCredentialVersion = session.credentialVersion + 1;
    await db.runTransaction(async (transaction) => {
      const currentSecret = await transaction.get(secretRef);
      if (currentSecret.data()?.pinHash !== storedHash) throw new KioskSessionHttpError(401);
      transaction.set(secretRef, { pinHash: newHash, pinVersion: 2, lastPinChangeAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      transaction.update(employeeRef, { credentialVersion: nextCredentialVersion, updatedAt: FieldValue.serverTimestamp() });
      transaction.set(db.collection("audit_events").doc(), buildAuditEvent({
        type: "kiosk.pin.changed", targetCollection: "kiosk_employee_secrets", targetId: session.employeeId,
        metadata: { plantId: session.plantId, pinVersion: 2 },
      }, req));
    });
    await revokeKioskSession(req, db);
    return clearKioskSessionCookies(Response.json({ success: true }));
  } catch (error) {
    if (error instanceof KioskSessionHttpError) return kioskSessionErrorResponse(error);
    if (error instanceof AppCheckHttpError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[Kiosk PIN change error]", error);
    return Response.json({ error: "No se pudo cambiar el PIN." }, { status: 500 });
  }
}
