import bcrypt from "bcryptjs";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const employeeId = typeof body?.employeeId === "string" ? body.employeeId.trim() : "";
    const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

    if (!employeeId || !isSixDigitPin(pin)) {
      return Response.json({ error: "Empleado y PIN de 6 digitos requeridos." }, { status: 400 });
    }

    const db = getAdminDb();
    const employeeRef = db.collection("kiosk_employees").doc(employeeId);
    const pinHash = await bcrypt.hash(pin, 12);

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

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof KioskPinError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Kiosk PIN setup error]:", error);
    return Response.json({ error: "No se pudo configurar el PIN." }, { status: 500 });
  }
}
