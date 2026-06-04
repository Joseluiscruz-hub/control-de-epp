import { NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { buildAuditEvent } from "@/lib/audit-events";
import { getAdminDb } from "@/lib/firebase-admin";
import { AuthHttpError, canAdminUsePlant, requireAdminUser } from "@/lib/server-auth";
import { isPlantId, normalizePlantId } from "@/lib/plants";

export const runtime = "nodejs";

function serializeDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : undefined;
}

function readText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function resolvePlant(req: NextRequest, adminUser: Awaited<ReturnType<typeof requireAdminUser>>) {
  if (adminUser.role !== "admin_global") return adminUser.plantaId;
  const plant = req.nextUrl.searchParams.get("plant");
  return plant && isPlantId(plant) ? plant : "todas";
}

function employeePayload(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    docId: id,
    id: readText(data.id) || id,
    name: readText(data.name),
    area: readText(data.area),
    personnelArea: readText(data.personnelArea),
    plantArea: readText(data.plantArea),
    position: readText(data.position),
    jobFunction: readText(data.jobFunction),
    plantaId: readText(data.plantaId),
    active: data.active === true,
    createdAt: serializeDate(data.createdAt),
  };
}

export async function GET(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const plant = resolvePlant(req, adminUser);
    const db = getAdminDb();
    const query = plant === "todas"
      ? db.collection("employees").limit(5000)
      : db.collection("employees").where("plantaId", "==", plant).limit(5000);
    const snapshot = await query.get();

    const employees = snapshot.docs
      .map((doc) => employeePayload(doc.id, doc.data()))
      .filter((employee) => canAdminUsePlant(adminUser, employee.plantaId));

    return Response.json(
      { employees },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Employees list API error]", error);
    return Response.json({ error: "No se pudo cargar la base de colaboradores." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const body = await req.json();
    const employeeId = readText(body?.employeeId).trim();
    const active = typeof body?.active === "boolean" ? body.active : null;
    if (!employeeId || active === null) {
      return Response.json({ error: "Colaborador y estado requerido." }, { status: 400 });
    }

    const db = getAdminDb();
    const employeeRef = db.collection("employees").doc(employeeId);
    const kioskRef = db.collection("kiosk_employees").doc(employeeId);
    const auditRef = db.collection("audit_events").doc();

    await db.runTransaction(async (transaction) => {
      const employeeSnap = await transaction.get(employeeRef);
      if (!employeeSnap.exists) {
        throw new AuthHttpError("Colaborador no encontrado.", 404);
      }

      const employee = employeeSnap.data() ?? {};
      const plantaId = normalizePlantId(employee.plantaId ?? adminUser.plantaId);
      if (!canAdminUsePlant(adminUser, plantaId)) {
        throw new AuthHttpError("No tienes permisos para operar esta planta.", 403);
      }

      transaction.update(employeeRef, {
        active,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(kioskRef, {
        name: readText(employee.name),
        area: readText(employee.area),
        plantaId,
        personnelArea: readText(employee.personnelArea),
        plantArea: readText(employee.plantArea) || readText(employee.area),
        position: readText(employee.position),
        jobFunction: readText(employee.jobFunction),
        active,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(auditRef, buildAuditEvent({
        type: active ? "employee.activate" : "employee.deactivate",
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        targetCollection: "employees",
        targetId: employeeId,
        before: { active: employee.active === true, plantaId },
        after: { active, plantaId },
      }, req));
    });

    return Response.json({ success: true, employeeId, active });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Employee status API error]", error);
    return Response.json({ error: "No se pudo actualizar el colaborador." }, { status: 500 });
  }
}
