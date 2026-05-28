import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { AuthHttpError, requireAdminUser } from "@/lib/server-auth";
import {
  getEppDurationRulePayload,
  resolveEppReplacementDays,
} from "@/lib/epp-duration-rules";
import { KioskEarlyReplacementAlert, KioskRequestItem, ReplacementReason } from "@/lib/kiosk-types";
import { normalizePlantId } from "@/lib/plants";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_REASONS = new Set(["vida_util", "desgaste", "extravio"]);
const ALERT_COLLECTION = "kiosk_alerts";

class KioskRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "KioskRequestError";
    this.status = status;
  }
}

type RequestItemInput = Partial<KioskRequestItem>;
type FulfillableKioskItem = KioskRequestItem & {
  chargeAmount?: number;
  signatureDataUrl?: string | null;
};

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate() as Date;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function readNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeFulfillableItems(input: unknown): FulfillableKioskItem[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw): FulfillableKioskItem | null => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Record<string, unknown>;
      const itemId = readText(item.itemId);
      const itemName = readText(item.itemName);
      const sku = readText(item.sku);
      const size = readText(item.size) || "N/A";
      const replacementDays = readNumber(item.replacementDays);
      const replacementReason = readText(item.replacementReason);
      if (!itemId || !itemName || !sku || replacementDays <= 0) return null;

      return {
        itemId,
        itemName,
        sku,
        size,
        replacementDays,
        ...(VALID_REASONS.has(replacementReason) ? { replacementReason: replacementReason as ReplacementReason } : {}),
        ...(readNumber(item.chargeAmount) > 0 ? { chargeAmount: readNumber(item.chargeAmount) } : {}),
        ...(typeof item.signatureDataUrl === "string" ? { signatureDataUrl: item.signatureDataUrl } : {}),
      };
    })
    .filter((item): item is FulfillableKioskItem => item !== null);
}

function getSizes(data: FirebaseFirestore.DocumentData) {
  return typeof data.sizes === "object" && data.sizes !== null
    ? data.sizes as Record<string, { sku?: string; material?: string; available?: boolean; stock?: number }>
    : undefined;
}

function isVariantAvailable(variant: { available?: boolean; stock?: number }) {
  return variant.available === true || Number(variant.stock ?? 0) > 0;
}

function isCatalogItemAvailable(data: FirebaseFirestore.DocumentData, size: string) {
  const sizes = getSizes(data);
  if (sizes && size !== "N/A") {
    const variant = sizes[size];
    return Boolean(variant && isVariantAvailable(variant));
  }
  return data.available === true || Number(data.stock ?? 0) > 0;
}

function buildStockUpdates(
  catalogData: FirebaseFirestore.DocumentData,
  item: FulfillableKioskItem
) {
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (item.size && item.size !== "N/A") {
    const sizes = getSizes(catalogData);
    const currentVariant = sizes?.[item.size];
    const currentStock = readNumber(currentVariant?.stock);

    if (!currentVariant || currentStock <= 0) {
      throw new KioskRequestError(`Sin stock disponible para ${item.itemName} talla ${item.size}.`, 409);
    }

    const nextVariantStock = currentStock - 1;
    const aggregateStock = Math.max(
      0,
      typeof catalogData.stock === "number"
        ? readNumber(catalogData.stock) - 1
        : Object.values(sizes ?? {}).reduce((sum, variant) => sum + readNumber(variant.stock), 0) - 1
    );

    updates[`sizes.${item.size}.stock`] = nextVariantStock;
    updates[`sizes.${item.size}.available`] = nextVariantStock > 0;
    updates.stock = aggregateStock;
    updates.available = aggregateStock > 0;
    return updates;
  }

  const currentStock = readNumber(catalogData.stock);
  if (currentStock <= 0) {
    throw new KioskRequestError(`Sin stock disponible para ${item.itemName}.`, 409);
  }

  const nextStock = currentStock - 1;
  updates.stock = nextStock;
  updates.available = nextStock > 0;
  return updates;
}

async function fulfillApprovedKioskRequest(params: {
  db: FirebaseFirestore.Firestore;
  requestId: string;
  approvedByUserId: string;
  approvedByEmail: string;
}) {
  const { db, requestId, approvedByUserId, approvedByEmail } = params;
  const requestRef = db.collection("kiosk_requests").doc(requestId);
  const statusRef = db.collection("kiosk_request_status").doc(requestId);

  return db.runTransaction(async (transaction) => {
    const requestSnap = await transaction.get(requestRef);

    if (!requestSnap.exists) {
      throw new KioskRequestError("Solicitud de kiosko no encontrada.", 404);
    }

    const requestData = requestSnap.data() ?? {};
    const currentStatus = readText(requestData.status) || "pending";
    const employeeId = readText(requestData.employeeId);
    const employeeName = readText(requestData.employeeName);
    const employeeArea = readText(requestData.employeeArea);
    const plantaId = normalizePlantId(requestData.plantaId);
    const items = normalizeFulfillableItems(requestData.items);
    const existingAssignmentIds = Array.isArray(requestData.assignmentIds)
      ? requestData.assignmentIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      : [];

    if (!employeeId || !employeeName || items.length === 0) {
      throw new KioskRequestError("Solicitud de kiosko incompleta para sincronizar consumo.", 409);
    }

    const existingFulfillmentSnap = await transaction.get(
      db.collection("assignments").where("kioskRequestId", "==", requestId).limit(20)
    );
    const existingFulfillmentIds = existingFulfillmentSnap.docs.map((docSnap) => docSnap.id);
    const alreadyFulfilledIds = existingAssignmentIds.length > 0 ? existingAssignmentIds : existingFulfillmentIds;

    if (alreadyFulfilledIds.length > 0) {
      transaction.update(requestRef, {
        status: "approved",
        assignmentIds: alreadyFulfilledIds,
        plantaId,
        syncedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(
        statusRef,
        {
          requestId,
          status: "approved",
          plantaId,
          source: "kiosk",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return { assignmentIds: alreadyFulfilledIds, fulfilled: false };
    }

    if (currentStatus !== "pending" && currentStatus !== "approved") {
      throw new KioskRequestError(`La solicitud ya esta ${currentStatus}.`, 409);
    }

    const catalogRefs = items.map((item) => db.collection("ppe_catalog").doc(item.itemId));
    const kioskCatalogRefs = items.map((item) => db.collection("kiosk_catalog").doc(item.itemId));
    const previousAssignmentQueries = items.map((item) =>
      db
        .collection("assignments")
        .where("employeeId", "==", employeeId)
        .where("sku", "==", item.sku)
        .where("status", "==", "active")
        .limit(10)
    );

    const catalogSnaps = await Promise.all(catalogRefs.map((ref) => transaction.get(ref)));
    const kioskCatalogSnaps = await Promise.all(kioskCatalogRefs.map((ref) => transaction.get(ref)));
    const previousAssignmentSnaps = await Promise.all(
      previousAssignmentQueries.map((previousQuery) => transaction.get(previousQuery))
    );

    const now = new Date();
    const assignmentRefs: FirebaseFirestore.DocumentReference[] = [];
    items.forEach((item, index) => {
      const catalogSnap = catalogSnaps[index];
      if (!catalogSnap.exists) {
        throw new KioskRequestError(`Material ${item.itemName} no encontrado en inventario.`, 404);
      }

      const stockUpdates = buildStockUpdates(catalogSnap.data() ?? {}, item);
      const assignmentRef = db.collection("assignments").doc();
      assignmentRefs.push(assignmentRef);

      transaction.set(assignmentRef, {
        employeeId,
        employeeName,
        employeeArea,
        plantaId,
        sku: item.sku,
        itemId: item.itemId,
        itemName: item.itemName,
        replacementDays: item.replacementDays,
        size: item.size || "N/A",
        assignedAt: FieldValue.serverTimestamp(),
        nextReplacementAt: Timestamp.fromDate(addDays(now, item.replacementDays)),
        status: "active",
        replacementReason: item.replacementReason ?? "vida_util",
        chargeAmount: item.chargeAmount ?? 0,
        chargeApproved: item.chargeAmount ? false : true,
        signatureDataUrl: item.signatureDataUrl ?? null,
        issuedByKiosk: true,
        issuedByUserId: approvedByUserId,
        approvedByEmail,
        kioskRequestId: requestId,
      });

      transaction.update(catalogRefs[index], stockUpdates);
      if (kioskCatalogSnaps[index].exists) {
        transaction.update(kioskCatalogRefs[index], stockUpdates);
      }

      previousAssignmentSnaps[index].docs.forEach((previousDoc) => {
        if (previousDoc.id === assignmentRef.id) return;
        transaction.update(previousDoc.ref, {
          status: "replaced",
          replacedByAssignmentId: assignmentRef.id,
          replacedByKioskRequestId: requestId,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    });

    const assignmentIds = assignmentRefs.map((ref) => ref.id);
    transaction.update(requestRef, {
      status: "approved",
      assignmentIds,
      plantaId,
      approvedAt: FieldValue.serverTimestamp(),
      approvedByUserId,
      approvedByEmail,
      syncedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(
      statusRef,
      {
        requestId,
        status: "approved",
        plantaId,
        source: "kiosk",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { assignmentIds, fulfilled: true };
  });
}

async function rejectKioskRequest(params: {
  db: FirebaseFirestore.Firestore;
  requestId: string;
  rejectedByUserId: string;
  rejectedByEmail: string;
}) {
  const { db, requestId, rejectedByUserId, rejectedByEmail } = params;
  const requestRef = db.collection("kiosk_requests").doc(requestId);
  const statusRef = db.collection("kiosk_request_status").doc(requestId);

  return db.runTransaction(async (transaction) => {
    const requestSnap = await transaction.get(requestRef);

    if (!requestSnap.exists) {
      throw new KioskRequestError("Solicitud de kiosko no encontrada.", 404);
    }

    const requestData = requestSnap.data() ?? {};
    const currentStatus = readText(requestData.status) || "pending";
    const plantaId = normalizePlantId(requestData.plantaId);
    if (currentStatus !== "pending" && currentStatus !== "rejected") {
      throw new KioskRequestError(`La solicitud ya esta ${currentStatus}.`, 409);
    }

    transaction.update(requestRef, {
      status: "rejected",
      plantaId,
      rejectedAt: FieldValue.serverTimestamp(),
      rejectedByUserId,
      rejectedByEmail,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(
      statusRef,
      {
        requestId,
        status: "rejected",
        plantaId,
        source: "kiosk",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { assignmentIds: [], fulfilled: false };
  });
}

async function sanitizeRequestItem(db: FirebaseFirestore.Firestore, input: RequestItemInput) {
  const itemId = readText(input.itemId);
  const requestedSize = readText(input.size) || "N/A";
  const requestedReason = readText(input.replacementReason);

  if (!itemId) {
    throw new KioskRequestError("Item de EPP requerido.", 400);
  }

  if (requestedReason && !VALID_REASONS.has(requestedReason)) {
    throw new KioskRequestError("Motivo de solicitud invalido.", 400);
  }
  const replacementReason = requestedReason ? requestedReason as ReplacementReason : undefined;

  const catalogSnap = await db.collection("kiosk_catalog").doc(itemId).get();
  if (!catalogSnap.exists) {
    throw new KioskRequestError("EPP no encontrado en catalogo de kiosko.", 404);
  }

  const catalog = catalogSnap.data() ?? {};
  if (catalog.active === false) {
    throw new KioskRequestError("EPP inactivo para kiosko.", 409);
  }

  const sizes = getSizes(catalog);
  const size = sizes ? requestedSize : "N/A";
  const variant = sizes ? sizes[size] : undefined;
  if (sizes && !variant) {
    throw new KioskRequestError("Talla no disponible para este EPP.", 400);
  }

  if (!isCatalogItemAvailable(catalog, size)) {
    throw new KioskRequestError("EPP sin stock disponible.", 409);
  }

  const sku = variant?.sku || readText(catalog.sku) || readText(catalog.material) || readText(input.sku);
  if (!sku) {
    throw new KioskRequestError("SKU de EPP requerido.", 400);
  }

  const ruleInput = {
    sku,
    material: variant?.material || readText(catalog.material),
    name: readText(catalog.name),
    sizes,
  };
  const fallbackDays = Number(catalog.replacementDays ?? input.replacementDays ?? 365);
  const replacementDays = resolveEppReplacementDays(
    ruleInput,
    Number.isFinite(fallbackDays) && fallbackDays > 0 ? fallbackDays : 365
  );

  return {
    itemId,
    itemName: readText(catalog.name) || readText(input.itemName) || itemId,
    sku,
    size,
    replacementDays,
    ...(replacementReason ? { replacementReason } : {}),
    ...getEppDurationRulePayload(ruleInput),
  };
}

function buildEarlyReplacementAlert(
  item: KioskRequestItem,
  assignment: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | undefined
): KioskEarlyReplacementAlert | null {
  if (!assignment) return null;

  const data = assignment.data();
  const assignedAt = toDate(data.assignedAt);
  if (!assignedAt) return null;

  const replacementDays = Number(item.replacementDays || data.replacementDays || 0);
  if (!Number.isFinite(replacementDays) || replacementDays <= 0) return null;

  const today = new Date();
  const nextEligibleAt = toDate(data.nextReplacementAt) ?? addDays(assignedAt, replacementDays);
  const daysUsed = Math.max(0, Math.floor((today.getTime() - assignedAt.getTime()) / DAY_MS));
  const daysRemaining = Math.max(0, Math.ceil((nextEligibleAt.getTime() - today.getTime()) / DAY_MS));

  if (daysRemaining <= 0 || daysUsed >= replacementDays) return null;

  return {
    itemId: item.itemId,
    itemName: item.itemName,
    sku: item.sku,
    size: item.size,
    replacementDays,
    daysUsed,
    daysRemaining,
    assignedAt: Timestamp.fromDate(assignedAt) as unknown as Date,
    nextEligibleAt: Timestamp.fromDate(nextEligibleAt) as unknown as Date,
    previousAssignmentId: assignment.id,
    severity: daysUsed < Math.ceil(replacementDays * 0.5) ? "critical" : "warning",
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const employeeId = readText(body?.employeeId);
    const employeeName = readText(body?.employeeName);
    const itemsInput = Array.isArray(body?.items) ? body.items as RequestItemInput[] : [];

    if (!employeeId || !employeeName || itemsInput.length === 0 || itemsInput.length > 10) {
      return Response.json({ error: "Empleado e items de solicitud requeridos." }, { status: 400 });
    }

    const db = getAdminDb();
    const employeeSnap = await db.collection("kiosk_employees").doc(employeeId).get();
    if (!employeeSnap.exists) {
      throw new KioskRequestError("Empleado no encontrado en kiosko.", 404);
    }

    const employee = employeeSnap.data() ?? {};
    const plantaId = normalizePlantId(employee.plantaId);
    if (employee.active !== true) {
      throw new KioskRequestError("Empleado inactivo para kiosko.", 403);
    }

    if (readText(employee.name) !== employeeName) {
      throw new KioskRequestError("Los datos del empleado no coinciden.", 409);
    }

    const sanitizedItems = await Promise.all(itemsInput.map((item) => sanitizeRequestItem(db, item)));
    const activeAssignmentsSnap = await db
      .collection("assignments")
      .where("employeeId", "==", employeeId)
      .where("status", "==", "active")
      .limit(100)
      .get();

    const activeAssignments = activeAssignmentsSnap.docs;
    const warnings = sanitizedItems
      .map((item) => {
        const matchingAssignment = activeAssignments.find((assignment) => {
          const data = assignment.data();
          return data.sku === item.sku || data.itemId === item.itemId;
        });
        return buildEarlyReplacementAlert(item, matchingAssignment);
      })
      .filter((warning): warning is KioskEarlyReplacementAlert => warning !== null);

    const items = sanitizedItems.map((item) => {
      const warning = warnings.find((candidate) => (
        candidate.itemId === item.itemId &&
        candidate.sku === item.sku &&
        candidate.size === item.size
      ));
      return warning ? { ...item, earlyReplacementAlert: warning } : item;
    });

    const requestRef = db.collection("kiosk_requests").doc();
    const statusRef = db.collection("kiosk_request_status").doc(requestRef.id);
    const employeeArea = readText(employee.area) || readText(employee.personnelArea) || readText(employee.plantArea);
    const alertRefs = warnings.map(() => db.collection(ALERT_COLLECTION).doc());

    const batch = db.batch();
    batch.set(requestRef, {
      employeeId,
      employeeName,
      employeeArea,
      plantaId,
      items,
      status: "pending",
      hasEarlyReplacementAlert: warnings.length > 0,
      earlyReplacementWarnings: warnings,
      earlyReplacementAlertIds: alertRefs.map((ref) => ref.id),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      source: "kiosk",
    });

    batch.set(statusRef, {
      requestId: requestRef.id,
      status: "pending",
      plantaId,
      source: "kiosk",
      updatedAt: FieldValue.serverTimestamp(),
    });

    warnings.forEach((warning, index) => {
      batch.set(alertRefs[index], {
        type: "early_epp_request",
        status: "open",
        severity: warning.severity,
        requestId: requestRef.id,
        employeeId,
        employeeName,
        employeeArea,
        plantaId,
        itemId: warning.itemId,
        itemName: warning.itemName,
        sku: warning.sku,
        size: warning.size,
        replacementDays: warning.replacementDays,
        daysUsed: warning.daysUsed,
        daysRemaining: warning.daysRemaining,
        assignedAt: warning.assignedAt ?? null,
        nextEligibleAt: warning.nextEligibleAt ?? null,
        previousAssignmentId: warning.previousAssignmentId ?? null,
        message: `${employeeName} solicito ${warning.itemName} antes de cumplir vida util; faltan ${warning.daysRemaining} dias.`,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        source: "kiosk",
      });
    });

    await batch.commit();

    return Response.json({
      requestId: requestRef.id,
      hasEarlyReplacementAlert: warnings.length > 0,
      earlyReplacementWarnings: warnings.length,
      earlyReplacementAlertIds: alertRefs.map((ref) => ref.id),
    });
  } catch (error) {
    if (error instanceof KioskRequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Kiosk request create error]:", error);
    return Response.json({ error: "No se pudo crear la solicitud de kiosko." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const body = await req.json();
    const requestId = readText(body?.requestId);
    const status = readText(body?.status);

    if (!requestId || (status !== "approved" && status !== "rejected")) {
      return Response.json({ error: "Solicitud y estado requeridos." }, { status: 400 });
    }

    const db = getAdminDb();
    const result = status === "approved"
      ? await fulfillApprovedKioskRequest({
          db,
          requestId,
          approvedByUserId: adminUser.uid,
          approvedByEmail: adminUser.email,
        })
      : await rejectKioskRequest({
          db,
          requestId,
          rejectedByUserId: adminUser.uid,
          rejectedByEmail: adminUser.email,
        });

    const alertsSnap = await db
      .collection(ALERT_COLLECTION)
      .where("requestId", "==", requestId)
      .limit(50)
      .get();

    const batch = db.batch();
    alertsSnap.docs.forEach((alertDoc) => {
      batch.update(alertDoc.ref, {
        status: status === "approved" ? "acknowledged" : "dismissed",
        requestStatus: status,
        resolvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();

    return Response.json({ success: true, requestId, status, ...result });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof KioskRequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Kiosk request status update error]:", error);
    return Response.json({ error: "No se pudo actualizar la solicitud de kiosko." }, { status: 500 });
  }
}
