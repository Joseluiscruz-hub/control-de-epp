import { NextRequest } from "next/server";
import { AuthHttpError, requireGlobalAdminUser } from "@/lib/server-auth";
import { getAdminDb } from "@/lib/firebase-admin";
import { isPlantId } from "@/lib/plants";

export const runtime = "nodejs";

function readText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readPermissions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  return {
    ...(input.canApproveKioskRequests === true ? { canApproveKioskRequests: true } : {}),
    ...(input.canApproveKioskAlerts === true ? { canApproveKioskAlerts: true } : {}),
  };
}

function readProfile(id: string, data: FirebaseFirestore.DocumentData) {
  const permissions = readPermissions(data.permissions);
  return {
    uid: readText(data.uid) || id,
    email: readText(data.email),
    role: data.role === "admin_local" ? "admin_local" : "admin_global",
    plantaId: isPlantId(data.plantaId) ? data.plantaId : "nacional",
    displayName: readText(data.displayName) || undefined,
    employeeId: /^\d{1,12}$/.test(readText(data.employeeId)) ? readText(data.employeeId) : undefined,
    ...(permissions && Object.keys(permissions).length > 0 ? { permissions } : {}),
    active: data.active !== false,
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireGlobalAdminUser(req);
    const snapshot = await getAdminDb().collection("users").limit(500).get();
    const users = snapshot.docs.map((doc) => readProfile(doc.id, doc.data()));

    return Response.json({ users }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Admin users API error]", error);
    return Response.json({ error: "No se pudo cargar el directorio de administradores." }, { status: 500 });
  }
}
