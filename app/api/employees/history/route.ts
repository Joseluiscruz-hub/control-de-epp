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

export async function GET(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const employeeId = req.nextUrl.searchParams.get("employeeId")?.trim() ?? "";
    if (!employeeId) {
      return Response.json({ error: "Colaborador requerido." }, { status: 400 });
    }

    const db = getAdminDb();
    const employeeSnap = await db.collection("employees").doc(employeeId).get();
    const employee = employeeSnap.data() ?? {};
    if (!employeeSnap.exists || !canAdminUsePlant(adminUser, readText(employee.plantaId))) {
      return Response.json({ error: "Colaborador no encontrado." }, { status: 404 });
    }

    const snapshot = await db.collection("assignments")
      .where("employeeId", "==", employeeId)
      .limit(50)
      .get();

    const assignments = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          sku: readText(data.sku),
          assignedAt: serializeDate(data.assignedAt),
          nextReplacementAt: serializeDate(data.nextReplacementAt),
          status: readText(data.status),
        };
      })
      .sort((a, b) => String(b.assignedAt ?? "").localeCompare(String(a.assignedAt ?? "")));

    return Response.json(
      { assignments },
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

