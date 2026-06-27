import { FieldValue, type Firestore, type Query } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { buildAuditEvent } from "@/lib/audit-events";
import { getAdminDb } from "@/lib/firebase-admin";
import { isPlantId, plantLabel, type PlantId } from "@/lib/plants";
import { AuthHttpError, requireGlobalAdminUser } from "@/lib/server-auth";

export const runtime = "nodejs";

const DELETE_BATCH_SIZE = 400;
const CONFIRM_TEXT = "RESTABLECER";

const RESET_MODULES = {
  catalogos: {
    label: "Catalogos",
    collections: ["ppe_catalog", "kiosk_catalog"],
  },
  alertas: {
    label: "Alertas",
    collections: ["kiosk_alerts", "kiosk_requests", "kiosk_request_status"],
  },
  inventario: {
    label: "Inventario",
    collections: ["assignments", "inventory_movements", "loss_charges"],
  },
  empleados: {
    label: "Empleados",
    collections: ["employees", "kiosk_employees", "kiosk_employee_secrets"],
  },
  presupuestos: {
    label: "Presupuestos",
    collections: ["budget_goals", "budget_spending"],
  },
} as const;

type ResetModule = keyof typeof RESET_MODULES;

const VALID_MODULES = new Set<ResetModule>(Object.keys(RESET_MODULES) as ResetModule[]);

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readModules(value: unknown): ResetModule[] {
  if (!Array.isArray(value)) return [];
  if (value.includes("todo")) return Object.keys(RESET_MODULES) as ResetModule[];

  const modules = value
    .map((entry) => readText(entry))
    .filter((entry): entry is ResetModule => VALID_MODULES.has(entry as ResetModule));

  return Array.from(new Set(modules));
}

async function deleteQuery(db: Firestore, query: Query) {
  let deleted = 0;

  while (true) {
    const snapshot = await query.limit(DELETE_BATCH_SIZE).get();
    if (snapshot.empty) break;

    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.size;

    if (snapshot.size < DELETE_BATCH_SIZE) break;
  }

  return deleted;
}

async function deleteCollectionByPlant(db: Firestore, collectionName: string, plantaId: PlantId) {
  return deleteQuery(db, db.collection(collectionName).where("plantaId", "==", plantaId));
}

async function readDocumentIdsByPlant(db: Firestore, collectionName: string, plantaId: PlantId) {
  const ids = new Set<string>();
  const snapshot = await db.collection(collectionName).where("plantaId", "==", plantaId).get();
  snapshot.docs.forEach((doc) => ids.add(doc.id));

  return ids;
}

async function deleteDocumentsById(db: Firestore, collectionName: string, ids: Iterable<string>) {
  const cleanIds = Array.from(new Set(Array.from(ids).filter(Boolean)));
  let deleted = 0;

  for (let index = 0; index < cleanIds.length; index += DELETE_BATCH_SIZE) {
    const batchIds = cleanIds.slice(index, index + DELETE_BATCH_SIZE);
    const snapshots = await db.getAll(...batchIds.map((id) => db.collection(collectionName).doc(id)));
    const batch = db.batch();
    let batchDeletes = 0;

    snapshots.forEach((snapshot) => {
      if (!snapshot.exists) return;
      batch.delete(snapshot.ref);
      batchDeletes += 1;
    });

    if (batchDeletes > 0) {
      await batch.commit();
      deleted += batchDeletes;
    }
  }

  return deleted;
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = await requireGlobalAdminUser(req);
    const body = await req.json();
    const plantaId = readText(body?.plantaId);
    const modules = readModules(body?.modules);
    const confirmText = readText(body?.confirmText).toUpperCase();

    if (!isPlantId(plantaId)) {
      return Response.json({ error: "Selecciona una planta valida para restablecer." }, { status: 400 });
    }

    if (modules.length === 0) {
      return Response.json({ error: "Selecciona al menos una informacion para eliminar." }, { status: 400 });
    }

    if (confirmText !== CONFIRM_TEXT) {
      return Response.json({ error: `Escribe ${CONFIRM_TEXT} para confirmar el restablecimiento.` }, { status: 400 });
    }

    const db = getAdminDb();
    const collectionNames = Array.from(new Set(
      modules.flatMap((module) => RESET_MODULES[module].collections)
    ));
    const deletedByCollection: Record<string, number> = {};
    const secretEmployeeIds = new Set<string>();
    if (collectionNames.includes("kiosk_employee_secrets")) {
      const employeeIds = await readDocumentIdsByPlant(db, "employees", plantaId);
      const kioskEmployeeIds = await readDocumentIdsByPlant(db, "kiosk_employees", plantaId);
      employeeIds.forEach((id) => secretEmployeeIds.add(id));
      kioskEmployeeIds.forEach((id) => secretEmployeeIds.add(id));
    }

    for (const collectionName of collectionNames) {
      deletedByCollection[collectionName] = collectionName === "kiosk_employee_secrets"
        ? await deleteDocumentsById(db, collectionName, secretEmployeeIds)
        : await deleteCollectionByPlant(db, collectionName, plantaId);
    }

    const eventRef = db.collection("plant_reset_events").doc();
    const moduleLabels = modules.map((module) => RESET_MODULES[module].label);
    const totalDeleted = Object.values(deletedByCollection).reduce((sum, count) => sum + count, 0);
    const eventPayload = {
      plantaId,
      plantLabel: plantLabel(plantaId),
      modules,
      moduleLabels,
      collections: deletedByCollection,
      totalDeleted,
      performedByUid: adminUser.uid,
      performedByEmail: adminUser.email,
      createdAt: FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    batch.set(eventRef, eventPayload);
    batch.set(db.collection("audit_events").doc(), buildAuditEvent({
      type: "admin.plant_reset",
      actorUid: adminUser.uid,
      actorEmail: adminUser.email,
      targetCollection: "plant_reset_events",
      targetId: eventRef.id,
      metadata: eventPayload,
    }, req));
    await batch.commit();

    return Response.json({
      success: true,
      plantaId,
      modules,
      deletedByCollection,
      totalDeleted,
      eventId: eventRef.id,
    });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Plant reset error]", error);
    return Response.json({ error: "No se pudo completar el restablecimiento de planta." }, { status: 500 });
  }
}
