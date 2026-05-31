import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { addDays } from "date-fns";
import { buildInventoryMovement, readNumber, readText } from "@/app/api/inventory/_lib";
import { buildAuditEvent } from "@/lib/audit-events";
import { getAdminDb } from "@/lib/firebase-admin";
import { normalizePlantId } from "@/lib/plants";
import { AuthHttpError, canAdminUsePlant, requireAdminUser } from "@/lib/server-auth";
import { resolveEppReplacementDays } from "@/lib/epp-duration-rules";

export const runtime = "nodejs";

class AssignmentHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AssignmentHttpError";
    this.status = status;
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const body = await req.json();
    const employeeId = readText(body?.employeeId);
    const itemId = readText(body?.itemId);

    if (!employeeId || !itemId) {
      return Response.json({ error: "Colaborador y material requeridos." }, { status: 400 });
    }

    const db = getAdminDb();
    const employeeRef = db.collection("employees").doc(employeeId);
    const itemRef = db.collection("ppe_catalog").doc(itemId);
    const kioskItemRef = db.collection("kiosk_catalog").doc(itemId);
    const assignmentRef = db.collection("assignments").doc();
    const movementRef = db.collection("inventory_movements").doc();
    const auditRef = db.collection("audit_events").doc();

    const result = await db.runTransaction(async (transaction) => {
      const [employeeSnap, itemSnap, kioskItemSnap] = await Promise.all([
        transaction.get(employeeRef),
        transaction.get(itemRef),
        transaction.get(kioskItemRef),
      ]);

      if (!employeeSnap.exists) throw new AssignmentHttpError("Colaborador no encontrado.", 404);
      if (!itemSnap.exists) throw new AssignmentHttpError("Material no encontrado.", 404);

      const employee = employeeSnap.data() ?? {};
      const item = itemSnap.data() ?? {};
      const plantaId = normalizePlantId(employee.plantaId ?? item.plantaId ?? adminUser.plantaId);

      if (!canAdminUsePlant(adminUser, plantaId)) {
        throw new AssignmentHttpError("No tienes permisos para operar esta planta.", 403);
      }
      if (employee.active === false) {
        throw new AssignmentHttpError("Colaborador inactivo.", 409);
      }

      const previousStock = readNumber(item.stock);
      if (previousStock <= 0) {
        throw new AssignmentHttpError("No hay stock disponible para este material.", 409);
      }

      const newStock = previousStock - 1;
      const sku = readText(item.sku) || itemId;
      const itemName = readText(item.name) || itemId;
      const replacementDays = resolveEppReplacementDays(
        {
          sku,
          material: item.material,
          name: itemName,
          sizes: item.sizes,
        },
        readNumber(item.replacementDays, 365)
      );

      transaction.set(assignmentRef, {
        employeeId,
        employeeName: readText(employee.name),
        employeeArea: readText(employee.area),
        plantaId,
        sku,
        itemId,
        itemName,
        replacementDays,
        size: "N/A",
        assignedAt: FieldValue.serverTimestamp(),
        nextReplacementAt: Timestamp.fromDate(addDays(new Date(), replacementDays)),
        status: "active",
        issuedByUserId: adminUser.uid,
        issuedByEmail: adminUser.email,
        source: "admin",
      });

      const stockUpdate = {
        stock: newStock,
        available: newStock > 0,
        plantaId,
        updatedAt: FieldValue.serverTimestamp(),
      };
      transaction.update(itemRef, stockUpdate);
      if (kioskItemSnap.exists) transaction.update(kioskItemRef, stockUpdate);

      transaction.set(movementRef, buildInventoryMovement({
        itemId,
        sku,
        size: "N/A",
        type: "assignment",
        previousStock,
        newStock,
        reason: "Dotacion manual desde panel administrador",
        source: "admin",
        plantaId,
        performedByUid: adminUser.uid,
        performedByEmail: adminUser.email,
        metadata: {
          assignmentId: assignmentRef.id,
          employeeId,
          employeeName: readText(employee.name),
          itemName,
        },
      }));

      transaction.set(auditRef, buildAuditEvent({
        type: "assignment.create",
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        targetCollection: "assignments",
        targetId: assignmentRef.id,
        after: { employeeId, itemId, sku, stock: newStock, plantaId },
      }, req));

      return { assignmentId: assignmentRef.id, stock: newStock, plantaId };
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AuthHttpError || error instanceof AssignmentHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[Assignment create API error]", error);
    return Response.json({ error: "No se pudo registrar la dotacion." }, { status: 500 });
  }
}
