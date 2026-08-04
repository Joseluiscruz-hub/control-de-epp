import { NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { AppCheckHttpError, requireAppCheck } from "@/lib/app-check";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  PublicRateLimitHttpError,
  publicRateLimitResponse,
  requirePublicRateLimit,
} from "@/lib/public-api-rate-limit";
import { KioskSessionHttpError, assertSameOrigin, kioskSessionErrorResponse, requireKioskSession } from "@/lib/kiosk-session-server";

export const runtime = "nodejs";

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate() as Date;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function serializeDate(value: unknown) {
  return toDate(value)?.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    await requireAppCheck(req);
    const db = getAdminDb();
    const session = await requireKioskSession(req, db);
    const body = await req.json();
    const suppliedEmployeeId = readText(body?.employeeId);
    if (suppliedEmployeeId && suppliedEmployeeId !== session.employeeId) {
      return Response.json({ error: "No tienes acceso a otro colaborador." }, { status: 403 });
    }
    const employeeId = session.employeeId;
    const sku = readText(body?.sku);
    if (!employeeId || !/^\d+$/.test(employeeId) || !sku) {
      return Response.json({ error: "Empleado y SKU requeridos." }, { status: 400 });
    }

    await requirePublicRateLimit(db, req, "kiosk_assignment_lookup");

    const employeeSnap = await db.collection("kiosk_employees").doc(employeeId).get();
    if (!employeeSnap.exists || employeeSnap.data()?.active !== true) {
      return Response.json({ assignment: null });
    }

    const assignmentsSnap = await db.collection("assignments")
      .where("employeeId", "==", employeeId)
      .limit(100)
      .get();

    const assignment = assignmentsSnap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() }))
      .filter(({ data }) => readText(data.sku) === sku && readText(data.status) === "active")
      .sort((a, b) => (toDate(b.data.assignedAt)?.getTime() ?? 0) - (toDate(a.data.assignedAt)?.getTime() ?? 0))[0];

    if (!assignment) {
      return Response.json({ assignment: null });
    }

    return Response.json({
      assignment: {
        id: assignment.id,
        sku: readText(assignment.data.sku),
        itemId: readText(assignment.data.itemId),
        itemName: readText(assignment.data.itemName),
        size: readText(assignment.data.size),
        assignedAt: serializeDate(assignment.data.assignedAt),
        nextReplacementAt: serializeDate(assignment.data.nextReplacementAt),
        status: readText(assignment.data.status),
      },
    });
  } catch (error) {
    if (error instanceof KioskSessionHttpError) return kioskSessionErrorResponse(error);
    if (error instanceof AppCheckHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PublicRateLimitHttpError) {
      return publicRateLimitResponse(error);
    }

    console.error("[Kiosk assignment lookup error]", error);
    return Response.json({ error: "No se pudo consultar la asignacion activa." }, { status: 500 });
  }
}
