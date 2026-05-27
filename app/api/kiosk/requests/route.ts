import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { AuthHttpError, requireAdminUser } from "@/lib/server-auth";
import {
  getEppDurationRulePayload,
  resolveEppReplacementDays,
} from "@/lib/epp-duration-rules";
import { KioskEarlyReplacementAlert, KioskRequestItem, ReplacementReason } from "@/lib/kiosk-types";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_REASONS = new Set(["vida_util", "desgaste", "extravio"]);

class KioskRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "KioskRequestError";
    this.status = status;
  }
}

type RequestItemInput = Partial<KioskRequestItem>;

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

    const batch = db.batch();
    batch.set(requestRef, {
      employeeId,
      employeeName,
      employeeArea,
      items,
      status: "pending",
      hasEarlyReplacementAlert: warnings.length > 0,
      earlyReplacementWarnings: warnings,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      source: "kiosk",
    });

    batch.set(statusRef, {
      requestId: requestRef.id,
      status: "pending",
      source: "kiosk",
      updatedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return Response.json({
      requestId: requestRef.id,
      hasEarlyReplacementAlert: warnings.length > 0,
      earlyReplacementWarnings: warnings.length,
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
    await requireAdminUser(req);
    const body = await req.json();
    const requestId = readText(body?.requestId);
    const status = readText(body?.status);

    if (!requestId || (status !== "approved" && status !== "rejected")) {
      return Response.json({ error: "Solicitud y estado requeridos." }, { status: 400 });
    }

    const db = getAdminDb();
    const requestRef = db.collection("kiosk_requests").doc(requestId);
    const statusRef = db.collection("kiosk_request_status").doc(requestId);
    const requestSnap = await requestRef.get();

    if (!requestSnap.exists) {
      return Response.json({ error: "Solicitud de kiosko no encontrada." }, { status: 404 });
    }

    const batch = db.batch();
    batch.update(requestRef, {
      status,
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(
      statusRef,
      {
        requestId,
        status,
        source: "kiosk",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await batch.commit();

    return Response.json({ success: true, requestId, status });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Kiosk request status update error]:", error);
    return Response.json({ error: "No se pudo actualizar la solicitud de kiosko." }, { status: 500 });
  }
}
