import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { buildAuditEvent } from "@/lib/audit-events";
import { getAdminDb } from "@/lib/firebase-admin";
import { buildInventoryCatalogPayload, buildKioskCatalogPayload, type InventoryImportItem } from "@/lib/inventory-import";
import { selectInventoryImportDocumentId } from "@/lib/inventory-document-id";
import { plantLabel } from "@/lib/plants";
import { AuthHttpError, requireAdminUser } from "@/lib/server-auth";
import {
  buildPlantScopedInventoryId,
  buildInventoryMovement,
  isObject,
  readStock,
  resolveWritePlant,
} from "../_lib";

export const runtime = "nodejs";

const MAX_IMPORT_ITEMS = 5000;

function parseInventoryItems(input: unknown): InventoryImportItem[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_IMPORT_ITEMS) {
    throw new AuthHttpError(`La carga debe incluir entre 1 y ${MAX_IMPORT_ITEMS} articulos.`, 400);
  }

  return input.map((raw, index) => {
    if (!isObject(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") {
      throw new AuthHttpError(`Articulo ${index + 1} invalido.`, 400);
    }
    return raw as unknown as InventoryImportItem;
  });
}

async function readExistingCatalog(ids: string[]) {
  const db = getAdminDb();
  const existing = new Map<string, FirebaseFirestore.DocumentData>();

  for (let index = 0; index < ids.length; index += 250) {
    const chunk = ids.slice(index, index + 250);
    const snapshots = await Promise.all(chunk.map((id) => db.collection("ppe_catalog").doc(id).get()));
    snapshots.forEach((snapshot, offset) => {
      if (snapshot.exists) existing.set(chunk[offset], snapshot.data() ?? {});
    });
  }

  return existing;
}

function buildImportDocumentIds(params: {
  items: InventoryImportItem[];
  plantaId: InventoryImportItem["plantaId"];
  existingCatalog: Map<string, FirebaseFirestore.DocumentData>;
}) {
  const itemDocIds = new Map<string, string>();

  for (const item of params.items) {
    const scopedId = buildPlantScopedInventoryId(params.plantaId, item.id);
    const baseDocument = params.existingCatalog.get(item.id);
    const scopedDocument = params.existingCatalog.get(scopedId);
    itemDocIds.set(
      item.id,
      selectInventoryImportDocumentId({
        baseId: item.id,
        scopedId,
        plantaId: params.plantaId,
        baseDocument: baseDocument ? { exists: true, plantaId: baseDocument.plantaId } : undefined,
        scopedDocument: scopedDocument ? { exists: true, plantaId: scopedDocument.plantaId } : undefined,
      })
    );
  }

  return itemDocIds;
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const body = await req.json();
    const items = parseInventoryItems(body?.items);
    const plantaId = resolveWritePlant(adminUser, body?.plantaId);
    const invalidPlantItem = items.find((item) => item.plantaId !== plantaId);
    if (invalidPlantItem) {
      throw new AuthHttpError(
        `El archivo contiene materiales de ${plantLabel(invalidPlantItem.plantaId)} y la carga esta configurada para ${plantLabel(plantaId)}. Selecciona la planta correcta o separa el archivo.`,
        400
      );
    }

    const db = getAdminDb();
    const candidateIds = Array.from(new Set(items.flatMap((item) => [
      item.id,
      buildPlantScopedInventoryId(plantaId, item.id),
    ])));
    const existingCatalog = await readExistingCatalog(candidateIds);
    const itemDocIds = buildImportDocumentIds({ items, plantaId, existingCatalog });

    let batch = db.batch();
    let writes = 0;
    let created = 0;
    let updated = 0;

    const commitIfNeeded = async (force = false) => {
      if (writes === 0 || (!force && writes < 390)) return;
      await batch.commit();
      batch = db.batch();
      writes = 0;
    };

    for (const item of items) {
      const itemDocId = itemDocIds.get(item.id);
      if (!itemDocId) {
        throw new AuthHttpError("Identificador de material invalido.", 400);
      }
      const existing = existingCatalog.get(itemDocId);
      const previousStock = existing ? readStock(existing) : 0;
      const catalogPayload = buildInventoryCatalogPayload(item);
      const kioskPayload = buildKioskCatalogPayload(item);

      batch.set(
        db.collection("ppe_catalog").doc(itemDocId),
        {
          ...catalogPayload,
          plantaId,
          ...(existing ? {} : { createdAt: FieldValue.serverTimestamp() }),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      batch.set(
        db.collection("kiosk_catalog").doc(itemDocId),
        {
          ...kioskPayload,
          plantaId,
          updatedAt: FieldValue.serverTimestamp(),
        }
      );
      batch.set(
        db.collection("inventory_movements").doc(),
        buildInventoryMovement({
          itemId: itemDocId,
          sku: item.sku,
          type: "import",
          previousStock,
          newStock: item.stock,
          reason: "Importacion de inventario",
          source: "import",
          plantaId,
          performedByUid: adminUser.uid,
          performedByEmail: adminUser.email,
          metadata: { itemName: item.name, variants: item.variants?.length ?? 0 },
        })
      );

      if (existing) updated++;
      else created++;
      writes += 3;
      await commitIfNeeded();
    }

    batch.set(
      db.collection("audit_events").doc(),
      buildAuditEvent({
        type: "inventory.import",
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        targetCollection: "ppe_catalog",
        targetId: plantaId,
        metadata: { created, updated, total: items.length, plantaId },
      }, req)
    );
    writes++;
    await commitIfNeeded(true);

    return Response.json({ success: true, created, updated, total: items.length, plantaId });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[Inventory import API error]", error);
    return Response.json({ error: "No se pudo cargar el inventario desde el servidor." }, { status: 500 });
  }
}
