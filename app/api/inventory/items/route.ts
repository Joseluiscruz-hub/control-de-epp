import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { buildAuditEvent } from "@/lib/audit-events";
import { getEppDurationRulePayload, resolveEppReplacementDays } from "@/lib/epp-duration-rules";
import { resolveStockFromPackageRule } from "@/lib/epp-package-rules";
import { getAdminDb } from "@/lib/firebase-admin";
import { AuthHttpError, requireAdminUser } from "@/lib/server-auth";
import {
  buildInventoryMovement,
  readNumber,
  readText,
  resolveWritePlant,
} from "../_lib";

export const runtime = "nodejs";

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
    const itemRef = db.collection("ppe_catalog").doc(sku);
    const kioskRef = db.collection("kiosk_catalog").doc(sku);
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
        minStock: 2,
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

    return Response.json({ success: true, itemId: sku, plantaId });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[Inventory item API error]", error);
    return Response.json({ error: "No se pudo guardar el material." }, { status: 500 });
  }
}
