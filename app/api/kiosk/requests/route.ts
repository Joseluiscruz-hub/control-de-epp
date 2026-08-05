import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { AppCheckHttpError, requireAppCheck } from "@/lib/app-check";
import { buildAuditEvent } from "@/lib/audit-events";
import { getAdminDb } from "@/lib/firebase-admin";
import { AuthHttpError, canAdminUsePlant, requireAdminUser, type AdminSession } from "@/lib/server-auth";
import {
  buildKioskApprovalActor,
  canApproveKioskAlert,
  type KioskApprovalActor,
} from "@/lib/kiosk-alert-approvers";
import {
  getEppDurationRulePayload,
  resolveEppReplacementDays,
} from "@/lib/epp-duration-rules";
import { resolveEppConsumption } from "@/lib/epp-consumption-rules";
import { resolveInventoryStockDecrease } from "@/lib/epp-package-rules";
import { KioskEarlyReplacementAlert, KioskRequestItem, ReplacementReason } from "@/lib/kiosk-types";
import { normalizePlantId } from "@/lib/plants";
import { buildInventoryMovement } from "@/app/api/inventory/_lib";
import { evaluateReplacement } from "@/lib/replacement-logic";
import {
  PublicRateLimitHttpError,
  publicRateLimitResponse,
  requirePublicRateLimit,
} from "@/lib/public-api-rate-limit";
import { KioskSessionHttpError, assertSameOrigin, kioskSessionErrorResponse, requireKioskSession } from "@/lib/kiosk-session-server";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_REASONS = new Set(["vida_util", "desgaste", "extravio"]);
const ALERT_COLLECTION = "kiosk_alerts";
const MAX_SIGNATURE_DATA_URL_LENGTH = 120_000;
const REQUEST_ITEM_KEYS = new Set([
  "itemId",
  "itemName",
  "sku",
  "size",
  "replacementDays",
  "replacementReason",
  "durationRuleId",
  "durationRuleSource",
  "durationRuleSku",
  "durationRuleSapMaterial",
  "requiredQuantity",
  "requiredUnit",
  "chargeAmount",
  "signatureDataUrl",
  "earlyReplacementAlert",
]);

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

type SanitizedKioskItem = KioskRequestItem & {
  unitCost: number;
  category: string;
  signatureDataUrl?: string | null;
};

type StockUpdateResult = {
  updates: Record<string, unknown>;
  size: string;
  previousStock: number;
  newStock: number;
  aggregatePreviousStock: number;
  aggregateNewStock: number;
  consumedQuantity: number;
  issuedQuantity: number;
  packageRuleId?: string;
  packageUnit?: "CAJA" | "BOLSA";
  stockUnit?: "PZA" | "CAJA" | "BOLSA";
  unitsPerPackage?: number;
};

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalAuditText(value: string | null | undefined) {
  return value && value.length > 0 ? value : null;
}

function readPackageUnit(value: unknown): "CAJA" | "BOLSA" | undefined {
  return value === "CAJA" || value === "BOLSA" ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function hasEarlyReplacementSignal(data: Record<string, unknown>) {
  if (data.hasEarlyReplacementAlert === true) return true;
  if (Array.isArray(data.earlyReplacementWarnings) && data.earlyReplacementWarnings.length > 0) return true;
  if (!Array.isArray(data.items)) return false;

  return data.items.some((item) => (
    item &&
    typeof item === "object" &&
    "earlyReplacementAlert" in item &&
    Boolean((item as { earlyReplacementAlert?: unknown }).earlyReplacementAlert)
  ));
}

function buildApprovalPatch(actor: KioskApprovalActor, approvedWithAlert: boolean) {
  return {
    approvedByUserId: actor.uid,
    approvedByEmail: actor.email,
    approvedByEmployeeId: actor.employeeId,
    approvedByName: actor.name,
    approvedByRole: actor.role,
    approvedByPlantId: actor.plantaId,
    approvedWithAlert,
    ...(approvedWithAlert
      ? {
          approvedAlertAt: FieldValue.serverTimestamp(),
          approvedAlertByUserId: actor.uid,
          approvedAlertByEmail: actor.email,
          approvedAlertByEmployeeId: actor.employeeId,
          approvedAlertByName: actor.name,
          approvedAlertPermissionSource: actor.permissionSource,
        }
      : {}),
  };
}

function sanitizeSignatureDataUrl(value: unknown) {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new KioskRequestError("Firma invalida.", 400);
  }
  const signature = value.trim();
  if (!signature) return undefined;
  if (signature.length > MAX_SIGNATURE_DATA_URL_LENGTH) {
    throw new KioskRequestError("La firma excede el tamaño permitido.", 413);
  }
  if (!/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(signature)) {
    throw new KioskRequestError("Formato de firma invalido.", 400);
  }
  return signature;
}

function isValidRequestItemShape(value: unknown): value is RequestItemInput {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => !REQUEST_ITEM_KEYS.has(key))) return false;

  const itemId = readText(value.itemId);
  if (!itemId) return false;

  const replacementReason = readText(value.replacementReason);
  if (replacementReason && !VALID_REASONS.has(replacementReason)) return false;

  if (
    value.replacementDays != null &&
    (!Number.isFinite(Number(value.replacementDays)) || Number(value.replacementDays) <= 0)
  ) {
    return false;
  }

  if (value.chargeAmount != null && (!Number.isFinite(Number(value.chargeAmount)) || Number(value.chargeAmount) < 0)) {
    return false;
  }

  if (value.signatureDataUrl != null && typeof value.signatureDataUrl !== "string") {
    return false;
  }

  return true;
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
        requiredQuantity: readNumber(item.requiredQuantity, 1),
        requiredUnit: readText(item.requiredUnit),
        unitCost: Math.max(0, readNumber(item.unitCost)),
        category: readText(item.category) || "Sin categoria",
        ...(VALID_REASONS.has(replacementReason) ? { replacementReason: replacementReason as ReplacementReason } : {}),
        ...(readNumber(item.chargeAmount) > 0 ? { chargeAmount: readNumber(item.chargeAmount) } : {}),
        ...(typeof item.signatureDataUrl === "string" ? { signatureDataUrl: item.signatureDataUrl } : {}),
      };
    })
    .filter((item): item is FulfillableKioskItem => item !== null);
}

function getSizes(data: FirebaseFirestore.DocumentData) {
  return typeof data.sizes === "object" && data.sizes !== null
    ? data.sizes as Record<string, {
      sku?: string;
      material?: string;
      available?: boolean;
      stock?: number;
      packageRuleId?: string;
      packageUnit?: "CAJA" | "BOLSA";
      stockUnit?: "PZA" | "CAJA" | "BOLSA";
      unitsPerPackage?: number;
      unitCost?: number;
    }>
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
): StockUpdateResult {
  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  const requiredQuantityRaw = readNumber(item.requiredQuantity, 1);
  const issuedQuantity = Number.isFinite(requiredQuantityRaw) && requiredQuantityRaw > 0
    ? requiredQuantityRaw
    : 1;

  if (item.size && item.size !== "N/A") {
    const sizes = getSizes(catalogData);
    const currentVariant = sizes?.[item.size];
    const packageUnit = readPackageUnit(currentVariant?.packageUnit);
    const unitsPerPackage = typeof currentVariant?.unitsPerPackage === "number" && currentVariant.unitsPerPackage > 0
      ? currentVariant.unitsPerPackage
      : undefined;
    const consumedQuantity = resolveInventoryStockDecrease({
      stockUnit: currentVariant?.stockUnit,
      packageUnit,
      unitsPerPackage,
      issuedQuantity,
    });
    const currentStock = readNumber(currentVariant?.stock);
    const aggregatePreviousStock = typeof catalogData.stock === "number"
      ? readNumber(catalogData.stock)
      : Object.values(sizes ?? {}).reduce((sum, variant) => sum + readNumber(variant.stock), 0);

    if (!currentVariant || currentStock < consumedQuantity) {
      throw new KioskRequestError(`Sin stock disponible para ${item.itemName} talla ${item.size}.`, 409);
    }

    const nextVariantStock = Number((currentStock - consumedQuantity).toFixed(2));
    const aggregateStock = Number((aggregatePreviousStock - consumedQuantity).toFixed(2));
    if (nextVariantStock < 0 || aggregateStock < 0) {
      throw new KioskRequestError(`Stock insuficiente para ${item.itemName} talla ${item.size}.`, 409);
    }

    updates[`sizes.${item.size}.stock`] = nextVariantStock;
    updates[`sizes.${item.size}.available`] = nextVariantStock > 0;
    updates.stock = aggregateStock;
    updates.available = aggregateStock > 0;
    return {
      updates,
      size: item.size,
      previousStock: currentStock,
      newStock: nextVariantStock,
      aggregatePreviousStock,
      aggregateNewStock: aggregateStock,
      consumedQuantity,
      issuedQuantity,
      packageRuleId: typeof currentVariant.packageRuleId === "string" ? currentVariant.packageRuleId : undefined,
      packageUnit,
      stockUnit: currentVariant.stockUnit,
      unitsPerPackage,
    };
  }

  const packageUnit = readPackageUnit(catalogData.packageUnit);
  const unitsPerPackage = typeof catalogData.unitsPerPackage === "number" && catalogData.unitsPerPackage > 0
    ? catalogData.unitsPerPackage
    : undefined;
  const consumedQuantity = resolveInventoryStockDecrease({
    stockUnit: catalogData.stockUnit,
    packageUnit,
    unitsPerPackage,
    issuedQuantity,
  });
  const currentStock = readNumber(catalogData.stock);
  if (currentStock < consumedQuantity) {
    throw new KioskRequestError(`Sin stock disponible para ${item.itemName}.`, 409);
  }

  const nextStock = Number((currentStock - consumedQuantity).toFixed(2));
  if (nextStock < 0) {
    throw new KioskRequestError(`Stock insuficiente para ${item.itemName}.`, 409);
  }
  updates.stock = nextStock;
  updates.available = nextStock > 0;
  return {
    updates,
    size: "N/A",
    previousStock: currentStock,
    newStock: nextStock,
    aggregatePreviousStock: currentStock,
    aggregateNewStock: nextStock,
    consumedQuantity,
    issuedQuantity,
    packageRuleId: typeof catalogData.packageRuleId === "string" ? catalogData.packageRuleId : undefined,
    packageUnit,
    stockUnit: catalogData.stockUnit,
    unitsPerPackage,
  };
}

async function fulfillApprovedKioskRequest(params: {
  db: FirebaseFirestore.Firestore;
  requestId: string;
  adminUser: AdminSession;
}) {
  const { db, requestId, adminUser } = params;
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
    const approvedWithAlert = hasEarlyReplacementSignal(requestData);
    const approvalActor = buildKioskApprovalActor(adminUser, plantaId);
    const existingAssignmentIds = Array.isArray(requestData.assignmentIds)
      ? requestData.assignmentIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      : [];

    if (!employeeId || !employeeName || items.length === 0) {
      throw new KioskRequestError("Solicitud de kiosko incompleta para sincronizar consumo.", 409);
    }
    if (!canAdminUsePlant(adminUser, plantaId)) {
      throw new KioskRequestError("No tienes permisos para operar esta planta.", 403);
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
      return { assignmentIds: alreadyFulfilledIds, fulfilled: false, plantaId, approvedWithAlert: false, approvalActor };
    }

    if (currentStatus !== "pending" && currentStatus !== "approved") {
      throw new KioskRequestError(`La solicitud ya esta ${currentStatus}.`, 409);
    }
    if (approvedWithAlert && !canApproveKioskAlert(adminUser, plantaId)) {
      throw new KioskRequestError(
        "Este usuario no esta autorizado para aprobar solicitudes con alerta de vida util.",
        403
      );
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

      const catalogData = catalogSnap.data() ?? {};
      const catalogPlant = readText(catalogData.plantaId);
      if (!catalogPlant || normalizePlantId(catalogPlant) !== plantaId) {
        throw new KioskRequestError(`Material ${item.itemName} no pertenece a la planta de la solicitud.`, 409);
      }
      const stockChange = buildStockUpdates(catalogData, item);
      const catalogVariant = item.size && item.size !== "N/A"
        ? getSizes(catalogData)?.[item.size]
        : undefined;
      const material = readText(catalogVariant?.material)
        || readText(catalogData.material)
        || readText(item.durationRuleSapMaterial)
        || item.sku;
      const consumption = resolveEppConsumption({
        sku: item.sku,
        material,
        codes: [item.durationRuleSku, item.durationRuleSapMaterial],
        issuedQuantity: stockChange.issuedQuantity,
        stockUnit: stockChange.stockUnit,
        packageUnit: stockChange.packageUnit,
        unitsPerPackage: stockChange.unitsPerPackage,
      });
      const assignmentRef = db.collection("assignments").doc();
      assignmentRefs.push(assignmentRef);

      transaction.set(assignmentRef, {
        employeeId,
        employeeName,
        employeeArea,
        area: employeeArea || "Sin area",
        plantaId,
        sku: item.sku,
        material,
        itemId: item.itemId,
        itemName: item.itemName,
        unitCost: Math.max(0, readNumber(item.unitCost)),
        category: readText(item.category) || readText(catalogData.category) || "Sin categoria",
        quantity: consumption.quantity,
        issuedQuantity: consumption.issuedQuantity,
        quantityUnit: consumption.quantityUnit,
        ...(consumption.rule
          ? {
              consumptionRuleId: consumption.rule.id,
              unitsPerPackage: consumption.rule.unitsPerPackage,
              unitDecrease: consumption.rule.unitDecrease,
            }
          : {}),
        ...(!consumption.rule && typeof stockChange.unitsPerPackage === "number" && stockChange.unitsPerPackage > 0
          ? {
              unitsPerPackage: stockChange.unitsPerPackage,
              unitDecrease: stockChange.consumedQuantity,
              packageUnit: stockChange.packageUnit,
              stockUnit: stockChange.stockUnit,
            }
          : {}),
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
        issuedByUserId: adminUser.uid,
        approvedByUserId: approvalActor.uid,
        approvedByEmail: adminUser.email,
        approvedByEmployeeId: approvalActor.employeeId,
        approvedByName: approvalActor.name,
        approvedWithAlert,
        kioskRequestId: requestId,
      });

      transaction.update(catalogRefs[index], stockChange.updates);
      if (kioskCatalogSnaps[index].exists) {
        transaction.update(kioskCatalogRefs[index], stockChange.updates);
      }

      transaction.set(
        db.collection("inventory_movements").doc(),
        buildInventoryMovement({
          itemId: item.itemId,
          sku: item.sku,
          size: stockChange.size,
          type: "assignment",
          previousStock: stockChange.previousStock,
          newStock: stockChange.newStock,
          reason: `Asignacion por solicitud kiosko ${requestId}`,
          source: "kiosk",
          plantaId,
          performedByUid: adminUser.uid,
          performedByEmail: adminUser.email,
          metadata: {
            requestId,
            assignmentId: assignmentRef.id,
            employeeId,
            employeeName,
            itemName: item.itemName,
            material,
            aggregatePreviousStock: stockChange.aggregatePreviousStock,
            aggregateNewStock: stockChange.aggregateNewStock,
            issuedQuantity: consumption.issuedQuantity,
            issuedUnit: "PZA",
            stockDecrease: stockChange.consumedQuantity,
            stockUnit: stockChange.stockUnit,
            consumedQuantity: consumption.quantity,
            consumedUnit: consumption.quantityUnit,
            reportQuantity: consumption.quantity,
            reportQuantityUnit: consumption.quantityUnit,
            ...(consumption.rule
              ? {
                  consumptionRuleId: consumption.rule.id,
                  unitDecrease: consumption.rule.unitDecrease,
                }
              : {}),
            ...(stockChange.packageRuleId ? { packageRuleId: stockChange.packageRuleId } : {}),
            ...(stockChange.packageUnit ? { packageUnit: stockChange.packageUnit } : {}),
            ...(typeof stockChange.unitsPerPackage === "number" && stockChange.unitsPerPackage > 0
              ? {
                  unitsPerPackage: stockChange.unitsPerPackage,
                  packageEquivalentConsumed: stockChange.consumedQuantity,
                }
              : {}),
          },
        })
      );

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
      ...buildApprovalPatch(approvalActor, approvedWithAlert),
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

    return { assignmentIds, fulfilled: true, plantaId, approvedWithAlert, approvalActor };
  });
}

async function rejectKioskRequest(params: {
  db: FirebaseFirestore.Firestore;
  requestId: string;
  adminUser: AdminSession;
}) {
  const { db, requestId, adminUser } = params;
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
    if (!canAdminUsePlant(adminUser, plantaId)) {
      throw new KioskRequestError("No tienes permisos para operar esta planta.", 403);
    }
    if (currentStatus !== "pending" && currentStatus !== "rejected") {
      throw new KioskRequestError(`La solicitud ya esta ${currentStatus}.`, 409);
    }

    transaction.update(requestRef, {
      status: "rejected",
      plantaId,
      rejectedAt: FieldValue.serverTimestamp(),
      rejectedByUserId: adminUser.uid,
      rejectedByEmail: adminUser.email,
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

    return {
      assignmentIds: [],
      fulfilled: false,
      plantaId,
      approvedWithAlert: false,
      approvalActor: buildKioskApprovalActor(adminUser, plantaId),
    };
  });
}

async function sanitizeRequestItem(
  db: FirebaseFirestore.Firestore,
  input: RequestItemInput,
  expectedPlantId: string
): Promise<SanitizedKioskItem> {
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
  const catalogPlant = readText(catalog.plantaId);
  if (!catalogPlant || normalizePlantId(catalogPlant) !== expectedPlantId) {
    throw new KioskRequestError("EPP no disponible para la planta del colaborador.", 403);
  }
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
  const signatureDataUrl = sanitizeSignatureDataUrl(input.signatureDataUrl);

  return {
    itemId,
    itemName: readText(catalog.name) || readText(input.itemName) || itemId,
    sku,
    size,
    replacementDays,
    unitCost: readNumber(variant?.unitCost ?? catalog.unitCost),
    category: readText(catalog.category) || "Sin categoria",
    ...(replacementReason ? { replacementReason } : {}),
    ...(signatureDataUrl ? { signatureDataUrl } : {}),
    ...getEppDurationRulePayload(ruleInput),
  };
}

function resolveServerChargeAmount(item: SanitizedKioskItem, assignment: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | undefined) {
  if (item.replacementReason !== "extravio" || !assignment) return 0;
  const assignedAt = toDate(assignment.data().assignedAt);
  if (!assignedAt) return 0;

  return evaluateReplacement(
    assignedAt,
    item.replacementDays,
    item.unitCost,
    "extravio"
  ).chargeAmount;
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
    await requireAppCheck(req);
    assertSameOrigin(req);
    const db = getAdminDb();
    const session = await requireKioskSession(req, db);
    const body = await req.json();
    const suppliedEmployeeId = readText(body?.employeeId);
    const suppliedEmployeeName = readText(body?.employeeName);
    if ((suppliedEmployeeId && suppliedEmployeeId !== session.employeeId) ||
        (suppliedEmployeeName && suppliedEmployeeName !== session.employeeName)) {
      return Response.json({ error: "No tienes acceso a otro colaborador." }, { status: 403 });
    }
    const employeeId = session.employeeId;
    const employeeName = session.employeeName;
    const itemsInput = Array.isArray(body?.items) ? body.items as RequestItemInput[] : [];

    if (!employeeId || !employeeName || itemsInput.length === 0 || itemsInput.length > 10) {
      return Response.json({ error: "Empleado e items de solicitud requeridos." }, { status: 400 });
    }
    if (!itemsInput.every(isValidRequestItemShape)) {
      return Response.json({ error: "Items de solicitud invalidos." }, { status: 400 });
    }

    await requirePublicRateLimit(db, req, "kiosk_request_create");

    const employeeSnap = await db.collection("kiosk_employees").doc(employeeId).get();
    if (!employeeSnap.exists) {
      throw new KioskRequestError("Empleado no encontrado en kiosko.", 404);
    }

    const employee = employeeSnap.data() ?? {};
    const plantaId = normalizePlantId(employee.plantaId);
    if (employee.active !== true) {
      throw new KioskRequestError("Empleado inactivo para kiosko.", 403);
    }
    if (plantaId !== session.plantId) {
      throw new KioskRequestError("La planta de la sesion no coincide.", 403);
    }

    if (readText(employee.name) !== employeeName) {
      throw new KioskRequestError("Los datos del empleado no coinciden.", 409);
    }

    const sanitizedItems = await Promise.all(itemsInput.map((item) => sanitizeRequestItem(db, item, plantaId)));
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
      const matchingAssignment = activeAssignments.find((assignment) => {
        const data = assignment.data();
        return data.sku === item.sku || data.itemId === item.itemId;
      });
      const warning = warnings.find((candidate) => (
        candidate.itemId === item.itemId &&
        candidate.sku === item.sku &&
        candidate.size === item.size
      ));
      const chargeAmount = resolveServerChargeAmount(item, matchingAssignment);
      const { signatureDataUrl, ...requestItem } = item;
      return {
        ...requestItem,
        ...(chargeAmount > 0 ? { chargeAmount } : {}),
        ...(chargeAmount > 0 && signatureDataUrl ? { signatureDataUrl } : {}),
        ...(warning ? { earlyReplacementAlert: warning } : {}),
      };
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
    batch.set(db.collection("audit_events").doc(), buildAuditEvent({
      type: "kiosk.request.create",
      targetCollection: "kiosk_requests",
      targetId: requestRef.id,
      after: { status: "pending", itemCount: items.length },
      metadata: {
        employeeId,
        employeeName,
        employeeArea,
        plantaId,
        warningCount: warnings.length,
      },
    }, req));

    await batch.commit();

    return Response.json({
      requestId: requestRef.id,
      hasEarlyReplacementAlert: warnings.length > 0,
      earlyReplacementWarnings: warnings.length,
      earlyReplacementAlertIds: alertRefs.map((ref) => ref.id),
    });
  } catch (error) {
    if (error instanceof KioskSessionHttpError) return kioskSessionErrorResponse(error);
    if (error instanceof AppCheckHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof KioskRequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PublicRateLimitHttpError) {
      return publicRateLimitResponse(error);
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
          adminUser,
        })
      : await rejectKioskRequest({
          db,
          requestId,
          adminUser,
        });

    const alertsSnap = await db
      .collection(ALERT_COLLECTION)
      .where("requestId", "==", requestId)
      .limit(50)
      .get();

    const batch = db.batch();
    const resolutionActor = status === "approved"
      ? result.approvalActor
      : buildKioskApprovalActor(adminUser, result.plantaId);
    const approvedWithAlert = status === "approved" && alertsSnap.size > 0;
    alertsSnap.docs.forEach((alertDoc) => {
      batch.update(alertDoc.ref, {
        status: status === "approved" ? "acknowledged" : "dismissed",
        requestStatus: status,
        resolvedByUserId: resolutionActor.uid,
        resolvedByEmail: resolutionActor.email,
        resolvedByEmployeeId: optionalAuditText(resolutionActor.employeeId),
        resolvedByName: resolutionActor.name,
        resolvedByRole: resolutionActor.role,
        resolvedByPlantId: resolutionActor.plantaId,
        ...(status === "approved"
          ? {
              approvedByUserId: resolutionActor.uid,
              approvedByEmail: resolutionActor.email,
              approvedByEmployeeId: optionalAuditText(resolutionActor.employeeId),
              approvedByName: resolutionActor.name,
              approvedAlertPermissionSource: resolutionActor.permissionSource,
            }
          : {}),
        resolvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    batch.set(db.collection("audit_events").doc(), buildAuditEvent({
      type: approvedWithAlert
        ? "kiosk.request.approve_with_alert"
        : status === "approved"
          ? "kiosk.request.approve"
          : "kiosk.request.reject",
      actorUid: adminUser.uid,
      actorEmail: adminUser.email,
      targetCollection: "kiosk_requests",
      targetId: requestId,
      after: {
        status,
        assignmentIds: result.assignmentIds,
        approvedWithAlert,
        approvedByEmployeeId: optionalAuditText(resolutionActor.employeeId),
        approvedByName: resolutionActor.name,
      },
      metadata: {
        plantaId: result.plantaId,
        fulfilled: result.fulfilled,
        alertCount: alertsSnap.size,
        actorEmployeeId: optionalAuditText(resolutionActor.employeeId),
        actorName: resolutionActor.name,
        actorRole: resolutionActor.role,
        actorPlantId: resolutionActor.plantaId,
        alertApprovalPermissionSource: resolutionActor.permissionSource,
      },
    }, req));

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
