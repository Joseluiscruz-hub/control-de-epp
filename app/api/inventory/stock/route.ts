import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { buildAuditEvent } from "@/lib/audit-events";
import { getAdminDb } from "@/lib/firebase-admin";
import { buildPublicKioskCatalogPayload } from "@/lib/kiosk-catalog-public";
import { AuthHttpError, requireAdminUser } from "@/lib/server-auth";
import { normalizePlantId } from "@/lib/plants";
import {
  assertPlantAccess,
  buildInventoryMovement,
  isObject,
  readNumber,
  readStock,
  readText,
  type StockAdjustmentType,
} from "../_lib";

export const runtime = "nodejs";

class InventoryStockError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "InventoryStockError";
    this.status = status;
  }
}

function getSizes(data: FirebaseFirestore.DocumentData) {
  return isObject(data.sizes) ? data.sizes as Record<string, Record<string, unknown>> : undefined;
}

function applyAdjustment(previous: number, quantity: number, type: StockAdjustmentType) {
  if (type === "add") return previous + quantity;
  if (type === "subtract") return previous - quantity;
  if (type === "set") return quantity;
  return previous;
}

export async function PATCH(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const body = await req.json();
    const itemId = readText(body?.itemId);
    const size = readText(body?.size) || "N/A";
    const type = readText(body?.type) as StockAdjustmentType;
    const quantity = readNumber(body?.quantity, -1);
    const reason = readText(body?.reason) || "Ajuste manual de inventario";

    if (!itemId || !["add", "subtract", "set"].includes(type) || quantity < 0) {
      return Response.json({ error: "Item, tipo y cantidad valida son requeridos." }, { status: 400 });
    }

    const db = getAdminDb();
    const itemRef = db.collection("ppe_catalog").doc(itemId);
    const kioskRef = db.collection("kiosk_catalog").doc(itemId);
    const movementRef = db.collection("inventory_movements").doc();
    const auditRef = db.collection("audit_events").doc();

    const result = await db.runTransaction(async (transaction) => {
      const itemSnap = await transaction.get(itemRef);

      if (!itemSnap.exists) {
        throw new InventoryStockError("Material no encontrado.", 404);
      }

      const item = itemSnap.data() ?? {};
      const plantaId = normalizePlantId(item.plantaId ?? adminUser.plantaId);
      assertPlantAccess(adminUser, plantaId);

      const sizes = getSizes(item);
      const sku = readText(item.sku) || itemId;
      let previousStock = 0;
      let newStock = 0;
      const updates: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (sizes && size !== "N/A") {
        const variant = sizes[size];
        if (!variant) throw new InventoryStockError("Talla no encontrada para este material.", 404);

        previousStock = readNumber(variant.stock);
        newStock = applyAdjustment(previousStock, quantity, type);
        if (newStock < 0) throw new InventoryStockError("El stock no puede quedar debajo de cero.", 409);

        const nextSizes = {
          ...sizes,
          [size]: {
            ...variant,
            stock: newStock,
            available: newStock > 0,
          },
        };
        const aggregateStock = Object.values(nextSizes).reduce((sum, variantData) => sum + readNumber(variantData.stock), 0);
        updates.sizes = nextSizes;
        updates.stock = aggregateStock;
        updates.available = aggregateStock > 0;
      } else {
        previousStock = readNumber(item.stock);
        newStock = applyAdjustment(previousStock, quantity, type);
        if (newStock < 0) throw new InventoryStockError("El stock no puede quedar debajo de cero.", 409);

        updates.stock = newStock;
        updates.available = newStock > 0;
      }

      transaction.update(itemRef, updates);
      transaction.set(kioskRef, {
        ...buildPublicKioskCatalogPayload(item, {
          available: typeof updates.available === "boolean" ? updates.available : undefined,
          sizeAvailability: sizes && size !== "N/A" ? { [size]: newStock > 0 } : undefined,
        }),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(movementRef, buildInventoryMovement({
        itemId,
        sku,
        size,
        type,
        previousStock,
        newStock,
        reason,
        source: "admin",
        plantaId,
        performedByUid: adminUser.uid,
        performedByEmail: adminUser.email,
        metadata: {
          itemName: readText(item.name),
          aggregatePreviousStock: readStock(item),
          aggregateNewStock: typeof updates.stock === "number" ? updates.stock : readStock(item),
        },
      }));
      transaction.set(auditRef, buildAuditEvent({
        type: "inventory.stock.adjust",
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        targetCollection: "ppe_catalog",
        targetId: itemId,
        before: { stock: previousStock, size },
        after: { stock: newStock, size, type, quantity },
        metadata: { plantaId, reason },
      }, req));

      return { itemId, previousStock, newStock, plantaId };
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AuthHttpError || error instanceof InventoryStockError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[Inventory stock API error]", error);
    return Response.json({ error: "No se pudo ajustar el inventario." }, { status: 500 });
  }
}
