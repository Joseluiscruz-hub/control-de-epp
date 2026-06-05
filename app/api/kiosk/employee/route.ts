import { NextRequest } from "next/server";
import { AppCheckHttpError, requireAppCheck } from "@/lib/app-check";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  PublicRateLimitHttpError,
  publicRateLimitResponse,
  requirePublicRateLimit,
} from "@/lib/public-api-rate-limit";

export const runtime = "nodejs";

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    await requireAppCheck(req);

    const body = await req.json();
    const employeeId = readText(body?.employeeId);
    if (!employeeId || !/^\d+$/.test(employeeId)) {
      return Response.json({ error: "Numero de empleado invalido." }, { status: 400 });
    }

    const db = getAdminDb();
    await requirePublicRateLimit(db, req, "kiosk_employee_lookup");

    const snapshot = await db.collection("kiosk_employees").doc(employeeId).get();
    if (!snapshot.exists) {
      return Response.json({ employee: null });
    }

    const employee = snapshot.data() ?? {};
    return Response.json({
      employee: {
          id: snapshot.id,
          name: readText(employee.name),
          area: readText(employee.area),
          active: employee.active === true,
          firstLogin: employee.firstLogin === true,
          termsAccepted: employee.termsAccepted === true,
        plantaId: readText(employee.plantaId),
      },
    });
  } catch (error) {
    if (error instanceof AppCheckHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PublicRateLimitHttpError) {
      return publicRateLimitResponse(error);
    }
    console.error("[Kiosk employee lookup error]:", error);
    return Response.json({ error: "No se pudo consultar el colaborador." }, { status: 500 });
  }
}
