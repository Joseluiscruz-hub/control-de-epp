import { NextRequest } from "next/server";
import { AppCheckHttpError, requireAppCheck } from "@/lib/app-check";
import { getAdminDb } from "@/lib/firebase-admin";
import { buildPublicKioskCatalogPayload } from "@/lib/kiosk-catalog-public";
import {
  KioskSessionHttpError,
  assertSameOrigin,
  kioskSessionErrorResponse,
  requireKioskSession,
} from "@/lib/kiosk-session-server";
import {
  PublicRateLimitHttpError,
  publicRateLimitResponse,
  requirePublicRateLimit,
} from "@/lib/public-api-rate-limit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    assertSameOrigin(req);
    await requireAppCheck(req);
    const db = getAdminDb();
    const session = await requireKioskSession(req, db);
    await requirePublicRateLimit(db, req, "kiosk_catalog_read");

    const snapshot = await db.collection("ppe_catalog")
      .where("plantaId", "==", session.plantId)
      .limit(500)
      .get();

    const items = snapshot.docs
      .filter((document) => document.data().active !== false)
      .map((document) => ({
        id: document.id,
        ...buildPublicKioskCatalogPayload(document.data()),
      } as Record<string, unknown> & { id: string }))
      .sort((left, right) => String(left.name ?? "").localeCompare(String(right.name ?? ""), "es"));

    return Response.json(
      { items },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof KioskSessionHttpError) return kioskSessionErrorResponse(error);
    if (error instanceof AppCheckHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof PublicRateLimitHttpError) return publicRateLimitResponse(error);

    console.error("[Kiosk catalog error]", error);
    return Response.json({ error: "No se pudo consultar el catalogo del kiosko." }, { status: 500 });
  }
}
