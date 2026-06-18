import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { buildAuditEvent } from "@/lib/audit-events";
import { getEppDurationRulePayload, resolveEppReplacementDays } from "@/lib/epp-duration-rules";
import { resolveStockFromPackageRule } from "@/lib/epp-package-rules";
import { getEppReorderPoint } from "@/lib/epp-reorder-points";
import { getAdminDb } from "@/lib/firebase-admin";
import { AuthHttpError, requireAdminUser } from "@/lib/server-auth";
import {
  buildPlantScopedInventoryId,
  buildInventoryMovement,
  readStock,
  readNumber,
  readText,
  resolveWritePlant,
} from "../_lib";

export const runtime = "nodejs";

function timestampToIso(value: unknown) {
  return value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function"
    ? (value.toDate() as Date).toISOString()
    : undefined;
}

export async function GET(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const requestedPlant = req.nextUrl.searchParams.get("plant");
    const plant = adminUser.role === "admin_global" && requestedPlant && requestedPlant !== "todas"
      ? requestedPlant
      : adminUser.role === "admin_global"
        ? "todas"
        : adminUser.plantaId;

    const db = getAdminDb();
    const query = plant === "todas"
      ? db.collection("ppe_catalog").limit(1000)
      : db.collection("ppe_catalog").where("plantaId", "==", plant).limit(1000);
    const snapshot = await query.get();

    const items = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        return {
          docId: doc.id,
          sku: readText(data.sku) || doc.id,
          name: readText(data.name),
          category: readText(data.category),
          replacementDays: readNumber(data.replacementDays, 365),
          stock: readStock(data),
          minStock: readNumber(data.minStock, 2),
          reorderPoint: typeof data.reorderPoint === "number" ? data.reorderPoint : undefined,
          hasSizes: data.hasSizes === true,
          sizes: data.sizes && typeof data.sizes === "object" ? data.sizes : undefined,
          material: readText(data.material),
          location: readText(data.location),
          unit: readText(data.unit),
          unitCost: readNumber(data.unitCost),
          stockUnit: data.stockUnit,
          packageUnit: data.packageUnit,
          unitsPerPackage: data.unitsPerPackage,
          stockPackageInput: data.stockPackageInput,
          packageRuleId: data.packageRuleId,
          plantaId: readText(data.plantaId),
          createdAt: timestampToIso(data.createdAt),
        };
      })
      .filter((item) => adminUser.role === "admin_global" || item.plantaId === adminUser.plantaId || !item.plantaId);

    return Response.json(
      { items },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Inventory list API error]", error);
    return Response.json({ error: "No se pudo leer el inventario." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const body = await req.json();
    const sku = readText(body?.sku).toUpperCase();
    const name = readText(body?.name);
    const category = readText(body?.category);
    const requestedDays = readNumber(body?.replacementDays);
    const stockInput = readNumber(body?.stock);
    const plantaId = resolveWritePlant(adminUser, body?.plantaId);

    if (!sku || !name || !category || requestedDays <= 0 || stockInput < 0) {
      return Response.json({ error: "SKU, nombre, categoria, vida util y stock validos son requeridos." }, { status: 400 });
    }

    const db = getAdminDb();
    const itemDocId = buildPlantScopedInventoryId(plantaId, sku);
    const itemRef = db.collection("ppe_catalog").doc(itemDocId);
    const kioskRef = db.collection("kiosk_catalog").doc(itemDocId);
    const movementRef = db.collection("inventory_movements").doc();
    const auditRef = db.collection("audit_events").doc();
    const ruleInput = { sku, name };
    const replacementDays = resolveEppReplacementDays(ruleInput, requestedDays);
    const rulePayload = getEppDurationRulePayload(ruleInput);
    const stockConversion = resolveStockFromPackageRule({
      name,
      stockInput,
    });
    const stock = stockConversion.stock;
    const reorderPoint = getEppReorderPoint(sku);
    const minStock = reorderPoint ?? 2;

    await db.runTransaction(async (transaction) => {
      const currentSnap = await transaction.get(itemRef);
      const current = currentSnap.data() ?? {};
      const previousStock = readNumber(current.stock);

      const payload = {
        sku,
        name,
        category,
        replacementDays,
        ...rulePayload,
        plantaId,
        stock,
        ...stockConversion.metadata,
        unit: stockConversion.metadata?.stockUnit ?? "PZA",
        minStock,
        ...(reorderPoint !== undefined ? { reorderPoint } : {}),
        hasSizes: false,
        active: true,
        available: stock > 0,
        ...(currentSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        updatedAt: FieldValue.serverTimestamp(),
      };

      transaction.set(itemRef, payload, { merge: true });
      transaction.set(kioskRef, payload, { merge: true });
      transaction.set(movementRef, buildInventoryMovement({
        itemId: sku,
        sku,
        type: currentSnap.exists ? "correction" : "add",
        previousStock,
        newStock: stock,
        reason: currentSnap.exists ? "Actualizacion manual de material" : "Alta manual de material",
        source: "admin",
        plantaId,
        performedByUid: adminUser.uid,
        performedByEmail: adminUser.email,
        metadata: {
          itemName: name,
          category,
          stockPackageInput: stockConversion.metadata?.stockPackageInput,
          packageRuleId: stockConversion.metadata?.packageRuleId,
          packageUnit: stockConversion.metadata?.packageUnit,
          unitsPerPackage: stockConversion.metadata?.unitsPerPackage,
        },
      }));
      transaction.set(auditRef, buildAuditEvent({
        type: currentSnap.exists ? "inventory.item.update" : "inventory.item.create",
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        targetCollection: "ppe_catalog",
        targetId: sku,
        before: currentSnap.exists ? { stock: previousStock, plantaId: current.plantaId ?? null } : null,
        after: { stock, stockInput, plantaId, name, category },
      }, req));
    });

    return Response.json({ success: true, itemId: itemDocId, sku, plantaId });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[Inventory item API error]", error);
    return Response.json({ error: "No se pudo guardar el material." }, { status: 500 });
  }
}
