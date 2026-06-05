import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { AppCheckHttpError, requireAppCheck } from "@/lib/app-check";
import { getAdminDb } from "@/lib/firebase-admin";
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
    const employee = employeeSnap.data();
    if (!employeeSnap.exists || employee?.active !== true) {
      return Response.json({ employee: null, assignments: [] });
    }

    const assignmentsSnap = await db.collection("assignments")
      .where("employeeId", "==", employeeId)
      .limit(100)
      .get();

    const assignments = assignmentsSnap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          sku: readText(data.sku),
          assignedAt: serializeDate(data.assignedAt),
          nextReplacementAt: serializeDate(data.nextReplacementAt),
          status: readText(data.status),
        };
      })
      .sort((a, b) => String(b.assignedAt ?? "").localeCompare(String(a.assignedAt ?? "")));

    return Response.json(
      {
        employee: {
          id: employeeSnap.id,
          name: readText(employee.name),
          area: readText(employee.area) || readText(employee.plantArea) || "SIN AREA",
        },
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
