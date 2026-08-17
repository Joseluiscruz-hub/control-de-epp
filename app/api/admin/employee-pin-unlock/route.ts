import { NextRequest } from "next/server";
import { buildAuditEvent } from "@/lib/audit-events";
import { normalizeEmployeeCredentialResetId } from "@/lib/employee-credential-reset";
import { getAdminDb } from "@/lib/firebase-admin";
import { clearKioskPinEmployeeFailures } from "@/lib/kiosk-pin-rate-limit";
import { parsePlantId } from "@/lib/plants";
import { AuthHttpError, canAdminUsePlant, requireAdminUser } from "@/lib/server-auth";

export const runtime = "nodejs";

class EmployeePinUnlockError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "EmployeePinUnlockError";
  }
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readEmployeePlantId(...records: Array<Record<string, unknown>>) {
  for (const record of records) {
    const plantId = parsePlantId(readText(record.plantaId));
    if (plantId) return plantId;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const body = await req.json().catch(() => null);
    const employeeId = normalizeEmployeeCredentialResetId(body?.employeeId);

    if (!employeeId) {
      return Response.json({ error: "Numero de socio invalido." }, { status: 400 });
    }

    const db = getAdminDb();
    const [employeeSnapshot, personnelSnapshot] = await Promise.all([
      db.collection("kiosk_employees").doc(employeeId).get(),
      db.collection("employees").doc(employeeId).get(),
    ]);

    if (!employeeSnapshot.exists) {
      throw new EmployeePinUnlockError("Colaborador no encontrado en kiosko.", 404);
    }

    const employee = employeeSnapshot.data() ?? {};
    const personnel = personnelSnapshot.data() ?? {};
    const plantId = readEmployeePlantId(employee, personnel);
    if (!plantId) {
      throw new EmployeePinUnlockError("Colaborador sin planta asignada.", 409);
    }
    if (!canAdminUsePlant(adminUser, plantId)) {
      throw new EmployeePinUnlockError("No tienes permisos para desbloquear colaboradores de esta planta.", 403);
    }

    await clearKioskPinEmployeeFailures(db, req, employeeId);
    await db.collection("audit_events").add(buildAuditEvent({
      type: "kiosk.employee_pin.unlocked",
      actorUid: adminUser.uid,
      actorEmail: adminUser.email,
      targetCollection: "kiosk_employees",
      targetId: employeeId,
      before: { pinAttemptsBlocked: true, plantId },
      after: { pinAttemptsBlocked: false, plantId },
      metadata: {
        requestedByRole: adminUser.role,
        requestedByPlant: adminUser.plantaId,
        credentialPreserved: true,
      },
    }, req));

    return Response.json(
      { success: true, employeeId, plantId, credentialPreserved: true },
      { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } },
    );
  } catch (error) {
    if (error instanceof AuthHttpError || error instanceof EmployeePinUnlockError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[Employee PIN unlock error]", error);
    return Response.json({ error: "No se pudo desbloquear el acceso del colaborador." }, { status: 500 });
  }
}
