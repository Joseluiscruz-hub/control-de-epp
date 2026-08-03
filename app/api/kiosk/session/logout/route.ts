import { NextRequest } from "next/server";
import { AppCheckHttpError, requireAppCheck } from "@/lib/app-check";
import {
  KioskSessionHttpError,
  assertSameOrigin,
  clearKioskSessionCookies,
  kioskSessionErrorResponse,
  revokeKioskSession,
} from "@/lib/kiosk-session-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireAppCheck(req);
    assertSameOrigin(req);
    await revokeKioskSession(req);
    return clearKioskSessionCookies(Response.json({ success: true }));
  } catch (error) {
    if (error instanceof KioskSessionHttpError) return kioskSessionErrorResponse(error);
    if (error instanceof AppCheckHttpError) return Response.json({ error: error.message }, { status: error.status });
    console.error("[Kiosk session logout error]", error);
    return clearKioskSessionCookies(Response.json({ error: "No se pudo cerrar la sesion." }, { status: 500 }));
  }
}
