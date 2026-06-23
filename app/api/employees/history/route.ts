import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { AuthHttpError, canAdminUsePlant, requireAdminUser } from "@/lib/server-auth";

export const runtime = "nodejs";

function readText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function serializeDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : undefined;
}

function serializeDateLike(value: unknown) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate() as Date;
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function GET(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const employeeId = req.nextUrl.searchParams.get("employeeId")?.trim() ?? "";
    const employeeDocId = req.nextUrl.searchParams.get("employeeDocId")?.trim() ?? "";
    if (!employeeId) {
      return Response.json({ error: "Colaborador requerido." }, { status: 400 });
    }

    const db = getAdminDb();
    let employeeSnap = await db.collection("employees").doc(employeeDocId || employeeId).get();
    if (!employeeSnap.exists && !employeeDocId) {
      const byNominaSnap = await db.collection("employees")
        .where("id", "==", employeeId)
        .limit(1)
        .get();
      const match = byNominaSnap.docs[0];
      if (match) employeeSnap = match;
    }

    const employee = employeeSnap.data() ?? {};
    if (!employeeSnap.exists || !canAdminUsePlant(adminUser, readText(employee.plantaId))) {
      return Response.json({ error: "Colaborador no encontrado." }, { status: 404 });
    }

    const employeeNumber = readText(employee.id) || employeeSnap.id || employeeId;
    const snapshot = await db.collection("assignments")
      .where("employeeId", "==", employeeNumber)
      .limit(50)
      .get();

    const assignments = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          sku: readText(data.sku),
          itemName: readText(data.itemName),
          size: readText(data.size),
          assignedAt: serializeDate(data.assignedAt),
          nextReplacementAt: serializeDate(data.nextReplacementAt),
          status: readText(data.status),
        };
      })
      .sort((a, b) => String(b.assignedAt ?? "").localeCompare(String(a.assignedAt ?? "")));

    const requestsSnap = await db.collection("kiosk_requests")
      .where("employeeId", "==", employeeNumber)
      .limit(50)
      .get();

    const requests = requestsSnap.docs
      .map((doc) => {
        const data = doc.data();
        const items = Array.isArray(data.items) ? data.items : [];
        return {
          id: doc.id,
          status: readText(data.status),
          createdAt: serializeDateLike(data.createdAt),
          updatedAt: serializeDateLike(data.updatedAt),
          approvedAt: serializeDateLike(data.approvedAt),
          rejectedAt: serializeDateLike(data.rejectedAt),
          hasEarlyReplacementAlert: data.hasEarlyReplacementAlert === true,
          assignmentIds: Array.isArray(data.assignmentIds)
            ? data.assignmentIds.filter((id: unknown): id is string => typeof id === "string")
            : [],
          items: items.map((item) => ({
            itemId: readText(item?.itemId),
            itemName: readText(item?.itemName),
            sku: readText(item?.sku),
            size: readText(item?.size),
            replacementDays: readNumber(item?.replacementDays),
            replacementReason: readText(item?.replacementReason),
            chargeAmount: readNumber(item?.chargeAmount),
          })),
        };
      })
      .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

    return Response.json(
      { employeeId: employeeNumber, assignments, requests },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Employee history API error]", error);
    return Response.json({ error: "No se pudo cargar el historial del colaborador." }, { status: 500 });
  }
}
