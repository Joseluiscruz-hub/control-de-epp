import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { buildAuditEvent } from "@/lib/audit-events";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { AuthHttpError, requireGlobalAdminUser } from "@/lib/server-auth";

export const runtime = "nodejs";

const VALID_ACTIONS = new Set(["reset_mfa", "revoke_sessions"]);

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    const adminUser = await requireGlobalAdminUser(req);
    const body = await req.json();
    const targetUid = readText(body?.targetUid);
    const action = readText(body?.action);

    if (!targetUid || !VALID_ACTIONS.has(action)) {
      return Response.json({ error: "Usuario destino y accion valida requeridos." }, { status: 400 });
    }

    if (targetUid === adminUser.uid) {
      return Response.json({ error: "No puedes ejecutar rescate sobre tu propia cuenta." }, { status: 409 });
    }

    const auth = getAdminAuth();
    const db = getAdminDb();
    const targetUser = await auth.getUser(targetUid);

    if (action === "reset_mfa") {
      await auth.updateUser(targetUid, {
        multiFactor: { enrolledFactors: [] },
      });
    }

    if (action === "revoke_sessions") {
      await auth.revokeRefreshTokens(targetUid);
    }

    const batch = db.batch();
    batch.set(db.collection("admin_rescue_events").doc(), {
      action,
      targetUid,
      targetEmail: targetUser.email ?? null,
      performedByUid: adminUser.uid,
      performedByEmail: adminUser.email,
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(db.collection("audit_events").doc(), buildAuditEvent({
      type: `admin.rescue.${action}`,
      actorUid: adminUser.uid,
      actorEmail: adminUser.email,
      targetCollection: "users",
      targetId: targetUid,
      metadata: {
        targetEmail: targetUser.email ?? null,
      },
    }, req));
    await batch.commit();

    return Response.json({
      success: true,
      action,
      targetUid,
      targetEmail: targetUser.email ?? null,
    });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Admin rescue error]", error);
    return Response.json({ error: "No se pudo completar el rescate administrativo." }, { status: 500 });
  }
}
