import { NextRequest } from "next/server";
import { AppCheckHttpError, requireAppCheck } from "@/lib/app-check";
import {
  KioskSessionHttpError,
  clearKioskSessionCookies,
  kioskSessionErrorResponse,
  requireKioskSession,
} from "@/lib/kiosk-session-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireAppCheck(req);
    const session = await requireKioskSession(req);
    return Response.json({
      authenticated: true,
      employeeId: session.employeeId,
      employeeName: session.employeeName,
      plantId: session.plantId,
      expiresAt: session.expiresAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof KioskSessionHttpError) return kioskSessionErrorResponse(error);
    if (error instanceof AppCheckHttpError) {
      return clearKioskSessionCookies(Response.json({ authenticated: false, error: error.message }, { status: error.status }));
    }
    console.error("[Kiosk session read error]", error);
    return clearKioskSessionCookies(Response.json({ authenticated: false, error: "No se pudo validar la sesion." }, { status: 500 }));
  }
}
