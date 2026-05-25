import { FieldValue } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { KioskSessionError, requireKioskSession } from "@/lib/kiosk-session-token";
import type { KioskRequestItem, ReplacementReason } from "@/lib/kiosk-types";

export const runtime = "nodejs";

const VALID_REASONS = new Set<ReplacementReason>(["vida_util", "desgaste", "extravio"]);

class KioskRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "KioskRequestError";
    this.status = status;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(input: Record<string, unknown>, key: string, max = 200) {
  const value = input[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseItems(value: unknown): KioskRequestItem[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) {
    throw new KioskRequestError("La solicitud debe incluir entre 1 y 10 productos.");
  }

  return value.map((raw, index) => {
    if (!isObject(raw)) {
      throw new KioskRequestError(`Producto ${index + 1} inválido.`);
    }

    const item: KioskRequestItem = {
      itemId: readString(raw, "itemId", 120),
      itemName: readString(raw, "itemName", 200),
      sku: readString(raw, "sku", 120),
      size: readString(raw, "size", 80),
      replacementDays: Number(raw.replacementDays),
    };

    const replacementReason = readString(raw, "replacementReason", 40);
    if (replacementReason) {
      if (!VALID_REASONS.has(replacementReason as ReplacementReason)) {
        throw new KioskRequestError(`Motivo inválido en producto ${index + 1}.`);
      }
      item.replacementReason = replacementReason as ReplacementReason;
    }

    if (!item.itemId || !item.itemName || !item.sku || !item.size) {
      throw new KioskRequestError(`Producto ${index + 1} incompleto.`);
    }

    if (!Number.isInteger(item.replacementDays) || item.replacementDays <= 0) {
      throw new KioskRequestError(`Vida útil inválida en producto ${index + 1}.`);
    }

    return item;
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = requireKioskSession(req);
    const body = await req.json();
    const items = parseItems(body?.items);
    const db = getAdminDb();
    const employeeRef = db.collection("kiosk_employees").doc(session.employeeId);
    const employeeSnapshot = await employeeRef.get();
    const employee = employeeSnapshot.data();

    if (!employeeSnapshot.exists || employee?.active !== true) {
      throw new KioskRequestError("Empleado inactivo o no encontrado para kiosko.", 403);
    }

    const requestRef = db.collection("kiosk_requests").doc();
    const employeeName = typeof employee.name === "string" ? employee.name : session.employeeName;
    const batch = db.batch();

    batch.set(requestRef, {
      employeeId: session.employeeId,
      employeeName,
      items,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      source: "kiosk",
    });

    batch.set(db.collection("kiosk_request_status").doc(requestRef.id), {
      requestId: requestRef.id,
      status: "pending",
      source: "kiosk",
      updatedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return Response.json({ success: true, requestId: requestRef.id });
  } catch (error) {
    if (error instanceof KioskSessionError || error instanceof KioskRequestError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    console.error("[Kiosk request API error]:", error);
    return Response.json({ error: "No se pudo crear la solicitud del kiosko." }, { status: 500 });
  }
}
