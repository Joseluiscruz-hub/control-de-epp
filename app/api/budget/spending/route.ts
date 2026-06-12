import { Timestamp } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { BudgetValidationError, parseBudgetPlantScope, parseBudgetYear } from "@/lib/budget";
import { getAdminDb } from "@/lib/firebase-admin";
import { AuthHttpError, requireAdminUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocumentData = FirebaseFirestore.DocumentData;

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNonNegative(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function getVariant(catalog: DocumentData, size: string) {
  if (!catalog.sizes || typeof catalog.sizes !== "object" || Array.isArray(catalog.sizes)) return null;
  const variant = (catalog.sizes as Record<string, unknown>)[size];
  return variant && typeof variant === "object" && !Array.isArray(variant)
    ? variant as Record<string, unknown>
    : null;
}

async function loadDocumentsById(
  db: FirebaseFirestore.Firestore,
  collectionName: string,
  ids: string[]
) {
  const result = new Map<string, DocumentData>();
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const chunk = uniqueIds.slice(index, index + 100);
    const snapshots = await db.getAll(...chunk.map((id) => db.collection(collectionName).doc(id)));
    snapshots.forEach((snapshot) => {
      if (snapshot.exists) result.set(snapshot.id, snapshot.data() ?? {});
    });
  }
  return result;
}

function mexicoYearAndMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function mexicoMonth(date: Date) {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    month: "numeric",
  }).format(date));
}

export async function GET(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const { searchParams } = new URL(req.url);
    const year = parseBudgetYear(searchParams.get("year"));
    const plantaId = parseBudgetPlantScope(searchParams.get("plantaId"), adminUser.plantaId);

    if (adminUser.role !== "admin_global" && plantaId !== adminUser.plantaId) {
      return Response.json({ error: "Sin acceso a esta planta." }, { status: 403 });
    }

    const start = new Date(`${year}-01-01T00:00:00-06:00`);
    const end = new Date(`${year + 1}-01-01T00:00:00-06:00`);
    const db = getAdminDb();
    const snap = await db.collection("assignments")
      .where("assignedAt", ">=", Timestamp.fromDate(start))
      .where("assignedAt", "<", Timestamp.fromDate(end))
      .get();

    const assignmentRows = snap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
    const employeeIds = assignmentRows.map(({ data }) => readText(data.employeeId));
    const itemIds = assignmentRows.map(({ data }) => readText(data.itemId));
    const [employees, catalog] = await Promise.all([
      loadDocumentsById(db, "employees", employeeIds),
      loadDocumentsById(db, "ppe_catalog", itemIds),
    ]);

    const byMonth = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [String(index + 1), 0]));
    const byCategory: Record<string, number> = {};
    const byArea: Record<string, number> = {};
    let totalSpent = 0;
    let assignmentCount = 0;
    let pricedAssignmentCount = 0;

    for (const { data } of assignmentRows) {
      const employeeId = readText(data.employeeId);
      const employee = employees.get(employeeId) ?? {};
      const assignmentPlant = readText(data.plantaId) || readText(employee.plantaId);
      if (plantaId !== "nacional" && assignmentPlant !== plantaId) continue;
      if (["cancelled", "canceled", "rejected", "deleted"].includes(readText(data.status).toLowerCase())) continue;

      assignmentCount += 1;
      const itemId = readText(data.itemId);
      const item = catalog.get(itemId) ?? {};
      const variant = getVariant(item, readText(data.size) || "N/A");
      const unitCost = readNonNegative(data.unitCost)
        ?? readNonNegative(variant?.unitCost)
        ?? readNonNegative(item.unitCost);
      if (unitCost === null || unitCost <= 0) continue;

      const quantity = Math.max(1, readNonNegative(data.quantity) ?? readNonNegative(data.requiredQuantity) ?? 1);
      const cost = Math.round(unitCost * quantity * 100) / 100;
      const assignedAt = data.assignedAt?.toDate?.() as Date | undefined;
      if (!assignedAt) continue;

      const month = String(mexicoMonth(assignedAt));
      const category = readText(data.category) || readText(item.category) || "Sin categoria";
      const area = readText(data.area)
        || readText(data.employeeArea)
        || readText(employee.area)
        || readText(employee.plantArea)
        || readText(employee.personnelArea)
        || "Sin area";

      pricedAssignmentCount += 1;
      totalSpent += cost;
      byMonth[month] = (byMonth[month] ?? 0) + cost;
      byCategory[category] = (byCategory[category] ?? 0) + cost;
      byArea[area] = (byArea[area] ?? 0) + cost;
    }

    const now = mexicoYearAndMonth();
    const monthsElapsed = year < now.year ? 12 : year === now.year ? now.month : 0;
    const roundedTotal = Math.round(totalSpent * 100) / 100;

    return Response.json({
      year,
      plantaId,
      totalSpent: roundedTotal,
      byMonth,
      byCategory,
      byArea,
      projected: monthsElapsed > 0 ? Math.round((roundedTotal / monthsElapsed) * 12 * 100) / 100 : 0,
      monthsElapsed,
      assignmentCount,
      pricedAssignmentCount,
      unpricedAssignmentCount: assignmentCount - pricedAssignmentCount,
    });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof BudgetValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[Budget spending GET]", error);
    return Response.json({ error: "No se pudo calcular el gasto presupuestal." }, { status: 500 });
  }
}
