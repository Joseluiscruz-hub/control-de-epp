import { NextRequest } from "next/server";
import { AppCheckHttpError, requireAppCheck } from "@/lib/app-check";
import { getAdminDb } from "@/lib/firebase-admin";
import { KioskSessionHttpError, assertSameOrigin, kioskSessionErrorResponse, requireKioskSession } from "@/lib/kiosk-session-server";
import { PublicRateLimitHttpError, publicRateLimitResponse, requirePublicRateLimit } from "@/lib/public-api-rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    await requireAppCheck(req);
    const db = getAdminDb();
    const session = await requireKioskSession(req, db);
    await requirePublicRateLimit(db, req, "kiosk_request_status");
    const body = await req.json();
    const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId || requestId.length > 128) return Response.json({ error: "Folio invalido." }, { status: 400 });
    const snapshot = await db.collection("kiosk_requests").doc(requestId).get();
    const data = snapshot.data();
    if (!snapshot.exists) return Response.json({ error: "Folio no encontrado." }, { status: 404 });
    if (data?.employeeId !== session.employeeId || data?.plantaId !== session.plantId) {
      return Response.json({ error: "No tienes acceso a este folio." }, { status: 403 });
    }
    return Response.json({ status: data.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof KioskSessionHttpError) return kioskSessionErrorResponse(error);
    if (error instanceof AppCheckHttpError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof PublicRateLimitHttpError) return publicRateLimitResponse(error);
    console.error("[Kiosk request status error]", error);
    return Response.json({ error: "No se pudo consultar el folio." }, { status: 500 });
  }
}
