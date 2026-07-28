import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { buildAuditEvent } from "@/lib/audit-events";
import { getEppDurationRulePayload } from "@/lib/epp-duration-rules";
import {
  candidateMatchesCatalogCodes,
  normalizeManualSku,
  resolveCanonicalEppCatalogItem,
  validateManualSku,
  type CanonicalEppCatalogItem,
  type EppCatalogCandidate,
} from "@/lib/epp-master-catalog";
import { isPackageUnit, resolveStockFromPackageRule } from "@/lib/epp-package-rules";
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

const CATALOG_LOOKUP_FIELDS = [
  "sku",
  "material",
  "durationRuleSku",
  "durationRuleSapMaterial",
] as const;

type CatalogCandidateRecord = EppCatalogCandidate & {
  docId: string;
  plantaId?: unknown;
};

function timestampToIso(value: unknown) {
  return value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function"
    ? (value.toDate() as Date).toISOString()
    : undefined;
}

async function readCatalogCandidates(
  db: FirebaseFirestore.Firestore,
  codes: readonly unknown[]
) {
  const normalizedCodes = Array.from(new Set(
    codes.map(normalizeManualSku).filter(Boolean)
  ));
  if (normalizedCodes.length === 0) return [] as CatalogCandidateRecord[];

  const snapshots = await Promise.all(
    normalizedCodes.flatMap((code) =>
      CATALOG_LOOKUP_FIELDS.map((field) =>
        db.collection("ppe_catalog").where(field, "==", code).limit(10).get()
      )
    )
  );
  const candidates = new Map<string, CatalogCandidateRecord>();
  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      candidates.set(doc.id, {
        docId: doc.id,
        ...doc.data(),
      });
    }
  }
  return Array.from(candidates.values());
}

async function resolveCatalogLookup(
  db: FirebaseFirestore.Firestore,
  inputSku: unknown
) {
  const requestedSku = normalizeManualSku(inputSku);
  const firstCandidates = await readCatalogCandidates(db, [requestedSku]);
  const firstMatch = resolveCanonicalEppCatalogItem(requestedSku, firstCandidates);
  if (!firstMatch) {
    return {
      item: undefined as CanonicalEppCatalogItem | undefined,
      candidates: firstCandidates,
    };
  }

  const additionalCandidates = await readCatalogCandidates(db, [
    firstMatch.sku,
    firstMatch.material,
    ...firstMatch.aliases,
  ]);
  const candidates = Array.from(new Map(
    [...firstCandidates, ...additionalCandidates].map((candidate) => [
      candidate.docId,
      candidate,
    ])
  ).values());

  return {
    item: resolveCanonicalEppCatalogItem(requestedSku, candidates) ?? firstMatch,
    candidates,
  };
}

function candidateExistsInPlant(
  candidate: CatalogCandidateRecord,
  plantaId: string,
  item: CanonicalEppCatalogItem
) {
  return (
    readText(candidate.plantaId) === plantaId &&
    candidateMatchesCatalogCodes(candidate, [
      item.sku,
      item.material,
      ...item.aliases,
    ])
  );
}

function parseOptionalNonNegativeNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

export async function GET(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const requestedPlant = req.nextUrl.searchParams.get("plant");
    const lookupSku = req.nextUrl.searchParams.get("lookupSku");
    const db = getAdminDb();

    if (lookupSku !== null) {
      const skuError = validateManualSku(lookupSku);
      if (skuError) {
        return Response.json({ error: skuError }, { status: 400 });
      }

      const plantaId = resolveWritePlant(adminUser, requestedPlant);
      const lookup = await resolveCatalogLookup(db, lookupSku);
      if (!lookup.item) {
        return Response.json(
          { error: "SKU no registrado en el catálogo maestro." },
          { status: 404 }
        );
      }

      const itemDocId = buildPlantScopedInventoryId(plantaId, lookup.item.sku);
      const directItem = await db.collection("ppe_catalog").doc(itemDocId).get();
      const existsInPlant =
        directItem.exists ||
        lookup.candidates.some((candidate) =>
          candidateExistsInPlant(candidate, plantaId, lookup.item!)
        );

      return Response.json({
        catalogItem: lookup.item,
        existsInPlant,
        plantaId,
      });
    }

    const plant = adminUser.role === "admin_global" && requestedPlant && requestedPlant !== "todas"
      ? requestedPlant
      : adminUser.role === "admin_global"
        ? "todas"
        : adminUser.plantaId;

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
    const requestedSku = normalizeManualSku(body?.sku);
    const skuError = validateManualSku(requestedSku);
    if (skuError) {
      return Response.json({ error: skuError }, { status: 400 });
    }

    const stockInput = Number(body?.stock);
    const location = readText(body?.location).toUpperCase();
    const requestedMinStock = parseOptionalNonNegativeNumber(body?.minStock);
    const unitCost = parseOptionalNonNegativeNumber(body?.unitCost);
    const requestedStockUnit = readText(body?.stockUnit).toUpperCase();
    const packageUnit = isPackageUnit(requestedStockUnit) ? requestedStockUnit : undefined;
    const unitsPerPackage = packageUnit ? Math.max(0, readNumber(body?.unitsPerPackage)) : undefined;
    const plantaId = resolveWritePlant(adminUser, body?.plantaId);

    if (!Number.isInteger(stockInput) || stockInput < 0 || stockInput > 1_000_000) {
      return Response.json(
        { error: "El stock debe ser un entero entre 0 y 1,000,000." },
        { status: 400 }
      );
    }
    if (!location || location.length > 40 || /[\u0000-\u001F\u007F]/.test(location)) {
      return Response.json(
        { error: "La ubicación es obligatoria y admite hasta 40 caracteres." },
        { status: 400 }
      );
    }
    if (
      (requestedMinStock !== undefined && (!Number.isInteger(requestedMinStock) || Number.isNaN(requestedMinStock) || requestedMinStock > 1_000_000)) ||
      (unitCost !== undefined && (Number.isNaN(unitCost) || unitCost > 100_000_000))
    ) {
      return Response.json(
        { error: "Stock mínimo o precio fuera de rango." },
        { status: 400 }
      );
    }
    if (packageUnit && (!unitsPerPackage || unitsPerPackage <= 0)) {
      return Response.json({ error: "Las piezas por caja/bolsa deben ser mayores a cero." }, { status: 400 });
    }

    const db = getAdminDb();
    const lookup = await resolveCatalogLookup(db, requestedSku);
    const catalogItem = lookup.item;
    if (!catalogItem) {
      return Response.json(
        { error: "SKU no registrado en el catálogo maestro. Solicita su alta antes de capturar stock." },
        { status: 404 }
      );
    }

    if (lookup.candidates.some((candidate) =>
      candidateExistsInPlant(candidate, plantaId, catalogItem)
    )) {
      return Response.json(
        { error: "El SKU ya existe en esta planta. Usa Ajustar stock para modificar existencias." },
        { status: 409 }
      );
    }

    const sku = catalogItem.sku;
    const material = catalogItem.material;
    const name = catalogItem.name;
    const category = catalogItem.category;
    const replacementDays = catalogItem.replacementDays;
    const itemDocId = buildPlantScopedInventoryId(plantaId, sku);
    const itemRef = db.collection("ppe_catalog").doc(itemDocId);
    const kioskRef = db.collection("kiosk_catalog").doc(itemDocId);
    const movementRef = db.collection("inventory_movements").doc();
    const auditRef = db.collection("audit_events").doc();
    const ruleInput = {
      sku,
      material,
      name,
      codes: [requestedSku, ...catalogItem.aliases],
    };
    const rulePayload = getEppDurationRulePayload(ruleInput);
    const stockConversion = resolveStockFromPackageRule({
      name,
      sku,
      material,
      codes: [requestedSku, ...catalogItem.aliases],
      stockInput,
      packageUnit,
      unitsPerPackage,
    });
    const stock = stockConversion.stock;
    const reorderPoint =
      catalogItem.reorderPoint ??
      getEppReorderPoint(material, sku, requestedSku);
    const minStock =
      reorderPoint ??
      requestedMinStock ??
      catalogItem.minStock;
    const unit = stockConversion.metadata?.stockUnit ?? catalogItem.unit;

    const payload = {
      sku,
      name,
      category,
      replacementDays,
      ...rulePayload,
      plantaId,
      stock,
      material,
      location,
      ...stockConversion.metadata,
      unit,
      ...(unitCost !== undefined ? { unitCost } : {}),
      minStock,
      ...(reorderPoint !== undefined ? { reorderPoint } : {}),
      hasSizes: false,
      active: true,
      available: stock > 0,
      manualEntry: true,
      catalogSource: catalogItem.source,
      catalogLookupSku: requestedSku,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await db.runTransaction(async (transaction) => {
      const currentSnap = await transaction.get(itemRef);
      if (currentSnap.exists) {
        throw new AuthHttpError(
          "El SKU ya existe en esta planta. Usa Ajustar stock para modificar existencias.",
          409
        );
      }

      transaction.create(itemRef, payload);
      transaction.set(kioskRef, payload, { merge: true });
      transaction.set(movementRef, buildInventoryMovement({
        itemId: sku,
        sku,
        type: "add",
        previousStock: 0,
        newStock: stock,
        reason: "Alta manual validada contra catálogo maestro",
        source: "admin",
        plantaId,
        performedByUid: adminUser.uid,
        performedByEmail: adminUser.email,
        metadata: {
          itemName: name,
          category,
          material,
          location,
          unit,
          catalogSource: catalogItem.source,
          catalogLookupSku: requestedSku,
          ...(unitCost !== undefined ? { unitCost } : {}),
          stockPackageInput: stockConversion.metadata?.stockPackageInput,
          packageRuleId: stockConversion.metadata?.packageRuleId,
          packageUnit: stockConversion.metadata?.packageUnit,
          unitsPerPackage: stockConversion.metadata?.unitsPerPackage,
        },
      }));
      transaction.set(auditRef, buildAuditEvent({
        type: "inventory.item.create",
        actorUid: adminUser.uid,
        actorEmail: adminUser.email,
        targetCollection: "ppe_catalog",
        targetId: sku,
        before: null,
        after: {
          stock,
          stockInput,
          plantaId,
          name,
          category,
          material,
          location,
          catalogSource: catalogItem.source,
          catalogLookupSku: requestedSku,
          ...(unitCost !== undefined ? { unitCost } : {}),
        },
      }, req));
    });

    return Response.json({
      success: true,
      itemId: itemDocId,
      sku,
      plantaId,
      item: {
        ...payload,
        createdAt: undefined,
        updatedAt: undefined,
      },
    });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("[Inventory item API error]", error);
    return Response.json({ error: "No se pudo guardar el material." }, { status: 500 });
  }
}
