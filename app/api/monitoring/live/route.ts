import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { AuthHttpError, requireAdminUser } from "@/lib/server-auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { isPlantId, type ActivePlantId, type PlantId } from "@/lib/plants";

export const runtime = "nodejs";

type LiveDoc = {
  id: string;
  data: Record<string, unknown>;
};

function daysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
}

function toSerializableData(data: FirebaseFirestore.DocumentData) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      value instanceof Timestamp ? value.toDate().toISOString() : value,
    ])
  ) as Record<string, unknown>;
}

function docsFrom(snapshot: FirebaseFirestore.QuerySnapshot, activePlantId: ActivePlantId): LiveDoc[] {
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    data: toSerializableData(doc.data()),
  })).filter((doc) => {
    if (activePlantId === "todas") return true;
    const plantaId = typeof doc.data.plantaId === "string" ? doc.data.plantaId : "";
    return !plantaId || plantaId === activePlantId;
  });
}

function resolvePlantScope(req: NextRequest, adminUser: Awaited<ReturnType<typeof requireAdminUser>>) {
  if (adminUser.role !== "admin_global") {
    return adminUser.plantaId as PlantId;
  }

  const requested = req.nextUrl.searchParams.get("plant");
  return requested && isPlantId(requested) ? requested : "todas";
}

export async function GET(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const activePlantId = resolvePlantScope(req, adminUser);
    const db = getAdminDb();
    const thirtyDaysAgo = daysAgo(30);

    const requestQuery = db.collection("kiosk_requests")
      .where("createdAt", ">=", thirtyDaysAgo)
      .orderBy("createdAt", "desc")
      .limit(200);

    const assignmentQuery = db.collection("assignments")
      .where("assignedAt", ">=", thirtyDaysAgo)
      .orderBy("assignedAt", "desc")
      .limit(500);

    const inventoryQuery = db.collection("ppe_catalog").limit(500);

    const employeesQuery = activePlantId === "todas"
      ? db.collection("employees").where("active", "==", true).limit(1000)
      : db.collection("employees").where("active", "==", true).where("plantaId", "==", activePlantId).limit(1000);

    const alertQuery = db.collection("kiosk_alerts")
      .where("createdAt", ">=", thirtyDaysAgo)
      .orderBy("createdAt", "desc")
      .limit(100);

    const [requests, assignments, inventory, employees, alerts] = await Promise.all([
      requestQuery.get(),
      assignmentQuery.get(),
      inventoryQuery.get(),
      employeesQuery.get(),
      alertQuery.get(),
    ]);

    return Response.json(
      {
        activePlantId,
        requests: docsFrom(requests, activePlantId),
        assignments: docsFrom(assignments, activePlantId),
        inventory: docsFrom(inventory, activePlantId),
        employees: docsFrom(employees, activePlantId),
        alerts: docsFrom(alerts, activePlantId),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Live monitoring API error]", error);
    return Response.json({ error: "No se pudo sincronizar la torre de control." }, { status: 500 });
  }
}
