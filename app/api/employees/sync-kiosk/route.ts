import { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { buildAuditEvent } from "@/lib/audit-events";
import { getAdminDb } from "@/lib/firebase-admin";
import { buildKioskEmployeeSyncPayload } from "@/lib/kiosk-employee-sync";
import { AuthHttpError, canAdminUsePlant, requireAdminUser } from "@/lib/server-auth";
import { isPlantId } from "@/lib/plants";

export const runtime = "nodejs";

function readText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function resolvePlant(req: NextRequest, adminUser: Awaited<ReturnType<typeof requireAdminUser>>) {
  if (adminUser.role !== "admin_global") return adminUser.plantaId;
  const plant = req.nextUrl.searchParams.get("plant");
  return plant && isPlantId(plant) ? plant : "todas";
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const plant = resolvePlant(req, adminUser);
    const db = getAdminDb();
    const employeesQuery = plant === "todas"
      ? db.collection("employees").limit(5000)
      : db.collection("employees").where("plantaId", "==", plant).limit(5000);
    const employeesSnap = await employeesQuery.get();
    const employees = employeesSnap.docs.filter((doc) => {
      const employee = doc.data();
      return canAdminUsePlant(adminUser, readText(employee.plantaId));
    });

    let batch = db.batch();
    let writes = 0;
    let created = 0;

    const commitIfNeeded = async (force = false) => {
      if (writes === 0 || (!force && writes < 440)) return;
      await batch.commit();
      batch = db.batch();
      writes = 0;
    };

    for (const doc of employees) {
      const employee = doc.data();
      const kioskRef = db.collection("kiosk_employees").doc(doc.id);
      const kioskSnap = await kioskRef.get();
      const payload = {
        ...buildKioskEmployeeSyncPayload(employee, adminUser.plantaId),
        updatedAt: FieldValue.serverTimestamp(),
      };

      batch.set(kioskRef, kioskSnap.exists
        ? payload
        : {
          ...payload,
          firstLogin: true,
          termsAccepted: false,
        }, { merge: true });
      if (!kioskSnap.exists) created++;
      writes++;
      await commitIfNeeded();
    }

    batch.set(db.collection("audit_events").doc(), buildAuditEvent({
      type: "kiosk.employees.sync",
      actorUid: adminUser.uid,
      actorEmail: adminUser.email,
      targetCollection: "kiosk_employees",
      targetId: plant,
      metadata: {
        plant,
        total: employees.length,
        created,
      },
    }, req));
    writes++;
    await commitIfNeeded(true);

    return Response.json({ success: true, total: employees.length, created });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Kiosk employees server sync error]", error);
    return Response.json({ error: "No se pudo sincronizar el kiosko." }, { status: 500 });
  }
}
