import { NextRequest } from "next/server";
import { AuthHttpError, requireGlobalAdminUser } from "@/lib/server-auth";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function readText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readProfile(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    uid: readText(data.uid) || id,
    email: readText(data.email),
    role: data.role === "admin_local" ? "admin_local" : "admin_global",
    plantaId: data.plantaId === "toluca" || data.plantaId === "cuautitlan" ? data.plantaId : "nacional",
    displayName: readText(data.displayName) || undefined,
    active: data.active !== false,
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireGlobalAdminUser(req);
    const snapshot = await getAdminDb().collection("users").limit(500).get();
    const users = snapshot.docs.map((doc) => readProfile(doc.id, doc.data()));

    return Response.json(
      { users },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Admin users API error]", error);
    return Response.json({ error: "No se pudo cargar el directorio de administradores." }, { status: 500 });
  }
}

