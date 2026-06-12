import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { buildAuditEvent } from "@/lib/audit-events";
import {
  BudgetValidationError,
  normalizeBudgetGoalInput,
  parseBudgetPlantScope,
  parseBudgetYear,
} from "@/lib/budget";
import { getAdminDb } from "@/lib/firebase-admin";
import { AuthHttpError, requireAdminUser, requireGlobalAdminUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const adminUser = await requireAdminUser(req);
    const { searchParams } = new URL(req.url);
    const year = parseBudgetYear(searchParams.get("year"));
    const plantaId = parseBudgetPlantScope(searchParams.get("plantaId"), adminUser.plantaId);

    if (adminUser.role !== "admin_global" && plantaId !== adminUser.plantaId) {
      return Response.json({ error: "Sin acceso a esta planta." }, { status: 403 });
    }

    const snap = await getAdminDb().collection("budget_goals").doc(`${plantaId}-${year}`).get();
    if (!snap.exists) return Response.json({ goal: null });

    const data = snap.data() ?? {};
    return Response.json({
      goal: {
        id: snap.id,
        plantaId: data.plantaId,
        year: data.year,
        annualLimit: data.annualLimit,
        monthlyLimits: data.monthlyLimits ?? undefined,
        alertThresholds: Array.isArray(data.alertThresholds) && data.alertThresholds.length > 0
          ? data.alertThresholds
          : [80, 100],
        currency: data.currency ?? "MXN",
      },
    });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof BudgetValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[Budget goal GET]", error);
    return Response.json({ error: "No se pudo cargar la meta presupuestal." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const adminUser = await requireGlobalAdminUser(req);
    const body = await req.json() as Record<string, unknown>;
    const goal = normalizeBudgetGoalInput(body);
    const goalId = `${goal.plantaId}-${goal.year}`;
    const db = getAdminDb();
    const goalRef = db.collection("budget_goals").doc(goalId);
    const auditRef = db.collection("audit_events").doc();
    const previousSnap = await goalRef.get();
    const previous = previousSnap.exists ? previousSnap.data() : null;

    const payload = {
      ...goal,
      monthlyLimits: goal.monthlyLimits ?? FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: adminUser.uid,
      ...(!previousSnap.exists ? {
        createdAt: FieldValue.serverTimestamp(),
        createdBy: adminUser.uid,
      } : {}),
    };

    const batch = db.batch();
    batch.set(goalRef, payload, { merge: true });
    batch.set(auditRef, buildAuditEvent({
      type: previousSnap.exists ? "budget.goal.update" : "budget.goal.create",
      actorUid: adminUser.uid,
      actorEmail: adminUser.email,
      targetCollection: "budget_goals",
      targetId: goalId,
      before: previous,
      after: goal,
    }, req));
    await batch.commit();

    return Response.json({ ok: true, goalId });
  } catch (error) {
    if (error instanceof AuthHttpError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof BudgetValidationError || error instanceof SyntaxError) {
      return Response.json({ error: error.message || "Solicitud invalida." }, { status: 400 });
    }
    console.error("[Budget goal PUT]", error);
    return Response.json({ error: "No se pudo guardar la meta presupuestal." }, { status: 500 });
  }
}
