import { FieldValue } from "firebase-admin/firestore";
import { AuthHttpError, canAdminUsePlant, type AdminSession } from "@/lib/server-auth";
import { normalizePlantId } from "@/lib/plants";

export type StockAdjustmentType = "add" | "subtract" | "set";
export type InventoryMovementType = StockAdjustmentType | "assignment" | "import" | "correction";

export function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function readNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeInventoryDocumentId(value: string) {
  return value
    .trim()
    .replace(/[\\/]+/g, "_")
    .replace(/[\u0000-\u001F\u007F]+/g, "")
    .slice(0, 140);
}

export function buildPlantScopedInventoryId(plantaId: string, itemId: string) {
  const plant = normalizePlantId(plantaId);
  const safeItemId = sanitizeInventoryDocumentId(itemId);
  if (!safeItemId) {
    throw new AuthHttpError("Identificador de material invalido.", 400);
  }
  return `${plant}__${safeItemId}`;
}

export function readStock(data: FirebaseFirestore.DocumentData) {
  if (typeof data.stock === "number") return Math.max(0, data.stock);
  const sizes = data.sizes;
  if (!sizes || typeof sizes !== "object" || Array.isArray(sizes)) return 0;
  return Object.values(sizes as Record<string, Record<string, unknown>>).reduce(
    (sum, variant) => sum + readNumber(variant.stock),
    0
  );
}

export function resolveWritePlant(adminUser: AdminSession, requestedPlant: unknown) {
  if (adminUser.role !== "admin_global") return normalizePlantId(adminUser.plantaId);
  return normalizePlantId(requestedPlant);
}

export function assertPlantAccess(adminUser: AdminSession, plantaId: string | null | undefined) {
  if (!canAdminUsePlant(adminUser, plantaId)) {
    throw new AuthHttpError("No tienes permisos para operar esta planta.", 403);
  }
}

export function buildInventoryMovement(params: {
  itemId: string;
  sku: string;
  size?: string;
  type: InventoryMovementType;
  previousStock: number;
  newStock: number;
  reason?: string;
  source: "admin" | "kiosk" | "import" | "system";
  plantaId: string;
  performedByUid: string;
  performedByEmail: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    itemId: params.itemId,
    sku: params.sku,
    size: params.size || "N/A",
    type: params.type,
    previousStock: params.previousStock,
    newStock: params.newStock,
    delta: params.newStock - params.previousStock,
    reason: params.reason || "",
    source: params.source,
    plantaId: params.plantaId,
    performedByUid: params.performedByUid,
    performedByEmail: params.performedByEmail,
    metadata: params.metadata ?? {},
    createdAt: FieldValue.serverTimestamp(),
  };
}
