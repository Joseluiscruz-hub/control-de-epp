import { FieldValue } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { NextRequest } from "next/server";
import { buildAuditEvent } from "@/lib/audit-events";
import { normalizeEmployeeCredentialResetId } from "@/lib/employee-credential-reset";
import { getAdminDb } from "@/lib/firebase-admin";
import { parsePlantId } from "@/lib/plants";
import { AuthHttpError, canAdminUsePlant, requireAdminUser } from "@/lib/server-auth";
import { clearKioskPinFailures, getKioskPinRateLimitKey } from "@/lib/kiosk-pin-rate-limit";

export const runtime = "nodejs";

class EmployeeCredentialResetError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EmployeeCredentialResetError";
    this.status = status;
  }
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readEmployeePlantId(...records: Array<Record<string, unknown>>) {
  for (const record of records) {
    const plantaId = parsePlantId(readText(record.plantaId));
    if (plantaId) return plantaId;
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
    const employeeRef = db.collection("kiosk_employees").doc(employeeId);
    const personnelRef = db.collection("employees").doc(employeeId);
    const secretRef = db.collection("kiosk_employee_secrets").doc(employeeId);
    const activationRef = db.collection("employee_activations").doc(employeeId);
    const auditRef = db.collection("audit_events").doc();
    const activationCode = randomInt(0, 100_000_000).toString().padStart(8, "0");
    const activationCodeHash = await bcrypt.hash(activationCode, 12);
    const activationExpiresAt = Date.now() + 30 * 60 * 1000;

    const result = await db.runTransaction(async (transaction) => {
      const [employeeSnap, personnelSnap, secretSnap] = await Promise.all([
        transaction.get(employeeRef),
        transaction.get(personnelRef),
        transaction.get(secretRef),
      ]);

      if (!employeeSnap.exists) {
        throw new EmployeeCredentialResetError("Colaborador no encontrado en kiosko.", 404);
      }

      const employee = employeeSnap.data() ?? {};
      const personnel = personnelSnap.data() ?? {};
      if (employee.active !== true) {
        throw new EmployeeCredentialResetError("Colaborador inactivo; no se puede resetear su acceso.", 403);
      }

      const plantaId = readEmployeePlantId(employee, personnel);
      if (!plantaId) {
        throw new EmployeeCredentialResetError("Colaborador sin planta asignada; sincroniza la base de colaboradores antes del reset.", 409);
      }

      if (!canAdminUsePlant(adminUser, plantaId)) {
        throw new EmployeeCredentialResetError("No tienes permisos para resetear colaboradores de esta planta.", 403);
      }

      const resetPayload = {
        firstLogin: true,
        termsAccepted: false,
        termsAcceptedAt: FieldValue.delete(),
        pin: FieldValue.delete(),
        pinVersion: FieldValue.delete(),
        lastPinChangeAt: FieldValue.delete(),
        legacyPinMigratedAt: FieldValue.delete(),
        credentialResetAt: FieldValue.serverTimestamp(),
        credentialResetByUid: adminUser.uid,
        credentialResetByEmail: adminUser.email,
        updatedAt: FieldValue.serverTimestamp(),
        plantaId,
        credentialVersion: Math.max(1, Number(employee.credentialVersion ?? 1)) + 1,
      };

      transaction.update(employeeRef, resetPayload);
      if (personnelSnap.exists) {
        transaction.update(personnelRef, resetPayload);
      }
      if (secretSnap.exists) {
        transaction.delete(secretRef);
      }
      transaction.set(activationRef, {
        employeeId,
        plantaId,
        codeHash: activationCodeHash,
        expiresAt: activationExpiresAt,
        usedAt: null,
        failedAttempts: 0,
        createdBy: adminUser.uid,
        createdAt: FieldValue.serverTimestamp(),
      });

      transaction.set(auditRef, buildAuditEvent({
        type: "kiosk.employee_credential.reset",
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        targetCollection: "kiosk_employees",
        targetId: employeeId,
        before: {
          firstLogin: employee.firstLogin === true,
          termsAccepted: employee.termsAccepted === true,
          hadSecret: secretSnap.exists,
          plantaId,
          activationExpiresAt,
        },
        after: {
          firstLogin: true,
          termsAccepted: false,
          secretDeleted: secretSnap.exists,
          plantaId,
        },
        metadata: {
          requestedByRole: adminUser.role,
          requestedByPlant: adminUser.plantaId,
        },
      }, req));

      return {
        employeeId,
        plantaId,
        secretDeleted: secretSnap.exists,
      };
    });

    await Promise.all([
      clearKioskPinFailures(db, getKioskPinRateLimitKey(req, employeeId, "verify")),
      clearKioskPinFailures(db, getKioskPinRateLimitKey(req, employeeId, "setup")),
    ]);

    return Response.json(
      { success: true, ...result, activationCode, activationExpiresAt },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          Pragma: "no-cache",
        },
      },
    );
  } catch (error) {
    if (error instanceof AuthHttpError || error instanceof EmployeeCredentialResetError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[Employee credential reset error]", error);
    return Response.json({ error: "No se pudo resetear el acceso del colaborador." }, { status: 500 });
  }
}
