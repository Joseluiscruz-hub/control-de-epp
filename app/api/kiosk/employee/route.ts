import { NextRequest } from "next/server";
import { AppCheckHttpError, requireAppCheck } from "@/lib/app-check";
import { getAdminDb } from "@/lib/firebase-admin";

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

    const snapshot = await getAdminDb().collection("kiosk_employees").doc(employeeId).get();
    if (!snapshot.exists) {
      return Response.json({ employee: null });
    }

    const employee = snapshot.data() ?? {};
    return Response.json({
      employee: {
        id: snapshot.id,
        name: readText(employee.name),
        area: readText(employee.area),
        personnelArea: readText(employee.personnelArea),
        plantArea: readText(employee.plantArea),
        position: readText(employee.position),
        jobFunction: readText(employee.jobFunction),
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
    console.error("[Kiosk employee lookup error]:", error);
    return Response.json({ error: "No se pudo consultar el colaborador." }, { status: 500 });
  }
}
