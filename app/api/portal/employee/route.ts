import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { AppCheckHttpError, requireAppCheck } from "@/lib/app-check";
import { getAdminDb } from "@/lib/firebase-admin";
import { buildPortalEmployeeResponse } from "@/lib/portal-employee-response";
import {
  PublicRateLimitHttpError,
  publicRateLimitResponse,
  requirePublicRateLimit,
} from "@/lib/public-api-rate-limit";

export const runtime = "nodejs";

function readText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function serializeDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate().toISOString() : undefined;
}

function readCatalogDescription(data: Record<string, unknown> | undefined) {
  if (!data) return "";
  return readText(data.name) || readText(data.description);
}

async function loadCatalogDescriptions(db: FirebaseFirestore.Firestore, itemKeys: string[]) {
  const uniqueKeys = Array.from(new Set(itemKeys.filter(Boolean)));
  const descriptions = new Map<string, string>();

  await Promise.all(uniqueKeys.map(async (itemKey) => {
    const [catalogSnap, kioskCatalogSnap] = await Promise.all([
      db.collection("ppe_catalog").doc(itemKey).get(),
      db.collection("kiosk_catalog").doc(itemKey).get(),
    ]);
    const description =
      readCatalogDescription(catalogSnap.exists ? catalogSnap.data() : undefined) ||
      readCatalogDescription(kioskCatalogSnap.exists ? kioskCatalogSnap.data() : undefined);
    if (description) descriptions.set(itemKey, description);
  }));

  return descriptions;
}

export async function POST(req: NextRequest) {
  try {
    await requireAppCheck(req);
    const body = await req.json();
    const employeeId = readText(body?.employeeId).trim();
    if (!employeeId || !/^\d+$/.test(employeeId)) {
      return Response.json({ error: "Numero de empleado invalido." }, { status: 400 });
    }

    const db = getAdminDb();
    await requirePublicRateLimit(db, req, "portal_employee_lookup");

    const employeeSnap = await db.collection("kiosk_employees").doc(employeeId).get();
    const employee = employeeSnap.exists
      ? buildPortalEmployeeResponse(employeeSnap.id, employeeSnap.data() ?? {})
      : null;
    if (!employee) {
      return Response.json({ employee: null, assignments: [] });
    }

    const assignmentsSnap = await db.collection("assignments")
      .where("employeeId", "==", employeeId)
      .limit(100)
      .get();

    const assignmentRows = assignmentsSnap.docs.map((doc) => ({
      id: doc.id,
      data: doc.data(),
    }));
    const catalogDescriptions = await loadCatalogDescriptions(
      db,
      assignmentRows.flatMap(({ data }) => [readText(data.itemId), readText(data.sku)])
    );

    const assignments = assignmentRows
      .map(({ id, data }) => {
        const sku = readText(data.sku);
        const itemId = readText(data.itemId);
        const itemName =
          readText(data.itemName) ||
          readText(data.description) ||
          catalogDescriptions.get(itemId) ||
          catalogDescriptions.get(sku) ||
          "";

        return {
          id,
          sku,
          itemId,
          itemName,
          size: readText(data.size),
          assignedAt: serializeDate(data.assignedAt),
          nextReplacementAt: serializeDate(data.nextReplacementAt),
          status: readText(data.status),
        };
      })
      .sort((a, b) => String(b.assignedAt ?? "").localeCompare(String(a.assignedAt ?? "")));

    return Response.json(
      {
        employee,
        assignments,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    if (error instanceof AppCheckHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PublicRateLimitHttpError) {
      return publicRateLimitResponse(error);
    }

    console.error("[Portal employee API error]", error);
    return Response.json({ error: "No se pudo consultar el colaborador." }, { status: 500 });
  }
}
