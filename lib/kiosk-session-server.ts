import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { buildAuditEvent } from "@/lib/audit-events";
import { getAdminDb } from "@/lib/firebase-admin";

export const KIOSK_SESSION_TTL_MS = 5 * 60 * 1000;
export const KIOSK_SESSION_COOKIE = "assetguard_kiosk_session";
export const KIOSK_DEVICE_COOKIE = "assetguard_kiosk_device";

const SESSION_COLLECTION = "kiosk_sessions";
const SESSION_PURPOSE = "ppe-kiosk";
const TOKEN_VERSION = "v1";

export type KioskSessionClaims = {
  sessionId: string;
  employeeId: string;
  employeeName: string;
  plantId: string;
  deviceIdHash: string;
  purpose: "ppe-kiosk";
  credentialVersion: number;
  issuedAt: number;
  expiresAt: number;
};

export class KioskSessionHttpError extends Error {
  constructor(public readonly status: 401 | 403, message = "La sesion de kiosko no es valida.") {
    super(message);
    this.name = "KioskSessionHttpError";
  }
}

function sessionSecret() {
  const configured = process.env.KIOSK_SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV !== "production") return "assetguard-development-only-kiosk-session-secret";
  throw new Error("KIOSK_SESSION_SECRET must contain at least 32 characters.");
}

export function hashKioskDeviceId(value: string) {
  return createHash("sha256").update(`${sessionSecret()}:${value}`).digest("hex");
}

function signature(sessionId: string) {
  return createHmac("sha256", sessionSecret()).update(`${TOKEN_VERSION}.${sessionId}`).digest("base64url");
}

export function signKioskSessionId(sessionId: string) {
  return `${TOKEN_VERSION}.${sessionId}.${signature(sessionId)}`;
}

export function verifyKioskSessionToken(token: string) {
  const [version, sessionId, suppliedSignature, extra] = token.split(".");
  if (version !== TOKEN_VERSION || !sessionId || !suppliedSignature || extra) return null;
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(signature(sessionId));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  return sessionId;
}

function cookie(name: string, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/api/kiosk; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function attachKioskSessionCookies(response: Response, token: string, deviceId: string) {
  const maxAge = Math.floor(KIOSK_SESSION_TTL_MS / 1000);
  response.headers.append("Set-Cookie", cookie(KIOSK_SESSION_COOKIE, token, maxAge));
  response.headers.append("Set-Cookie", cookie(KIOSK_DEVICE_COOKIE, deviceId, maxAge));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function clearKioskSessionCookies(response: Response) {
  response.headers.append("Set-Cookie", cookie(KIOSK_SESSION_COOKIE, "", 0));
  response.headers.append("Set-Cookie", cookie(KIOSK_DEVICE_COOKIE, "", 0));
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function readCookie(req: NextRequest, name: string) {
  return req.cookies.get(name)?.value ?? "";
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function createKioskSession(input: {
  req: NextRequest;
  employeeId: string;
  employeeName: string;
  plantId: string;
  credentialVersion?: number;
  db?: Firestore;
}) {
  const db = input.db ?? getAdminDb();
  const sessionId = randomUUID();
  const deviceId = randomBytes(32).toString("base64url");
  const issuedAt = Date.now();
  const claims: KioskSessionClaims = {
    sessionId,
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    plantId: input.plantId,
    deviceIdHash: hashKioskDeviceId(deviceId),
    purpose: SESSION_PURPOSE,
    credentialVersion: input.credentialVersion ?? 1,
    issuedAt,
    expiresAt: issuedAt + KIOSK_SESSION_TTL_MS,
  };

  const batch = db.batch();
  batch.set(db.collection(SESSION_COLLECTION).doc(sessionId), {
    ...claims,
    revokedAt: null,
    createdAt: FieldValue.serverTimestamp(),
    lastActivityAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection("audit_events").doc(), buildAuditEvent({
    type: "kiosk.session.created",
    targetCollection: SESSION_COLLECTION,
    targetId: sessionId,
    metadata: { employeeId: input.employeeId, plantId: input.plantId, purpose: SESSION_PURPOSE, expiresAt: claims.expiresAt },
  }, input.req));
  await batch.commit();
  return { claims, token: signKioskSessionId(sessionId), deviceId };
}

export async function requireKioskSession(req: NextRequest, db: Firestore = getAdminDb()) {
  const token = readCookie(req, KIOSK_SESSION_COOKIE);
  const deviceId = readCookie(req, KIOSK_DEVICE_COOKIE);
  const sessionId = token ? verifyKioskSessionToken(token) : null;
  if (!sessionId || !deviceId) throw new KioskSessionHttpError(401);

  const sessionRef = db.collection(SESSION_COLLECTION).doc(sessionId);
  const snapshot = await sessionRef.get();
  const data = snapshot.data();
  if (!snapshot.exists || !data) throw new KioskSessionHttpError(401);

  const claims = {
    sessionId,
    employeeId: readText(data.employeeId),
    employeeName: readText(data.employeeName),
    plantId: readText(data.plantId),
    deviceIdHash: readText(data.deviceIdHash),
    purpose: data.purpose,
    credentialVersion: Number(data.credentialVersion ?? 1),
    issuedAt: Number(data.issuedAt),
    expiresAt: Number(data.expiresAt),
  } as KioskSessionClaims;

  if (data.revokedAt || claims.purpose !== SESSION_PURPOSE || !claims.employeeId || !claims.plantId ||
      !Number.isFinite(claims.expiresAt) || claims.expiresAt <= Date.now() || claims.deviceIdHash !== hashKioskDeviceId(deviceId)) {
    throw new KioskSessionHttpError(401);
  }

  const employeeSnapshot = await db.collection("kiosk_employees").doc(claims.employeeId).get();
  const employee = employeeSnapshot.data();
  const currentPlantId = readText(employee?.plantaId);
  const currentCredentialVersion = Number(employee?.credentialVersion ?? 1);
  if (!employeeSnapshot.exists || employee?.active !== true) throw new KioskSessionHttpError(401);
  if (currentPlantId !== claims.plantId || currentCredentialVersion !== claims.credentialVersion) {
    throw new KioskSessionHttpError(403, "La sesion ya no corresponde al colaborador o planta autorizados.");
  }

  await sessionRef.set({ lastActivityAt: FieldValue.serverTimestamp() }, { merge: true });
  return claims;
}

export async function revokeKioskSession(req: NextRequest, db: Firestore = getAdminDb()) {
  const token = readCookie(req, KIOSK_SESSION_COOKIE);
  const sessionId = token ? verifyKioskSessionToken(token) : null;
  if (!sessionId) return;
  const sessionRef = db.collection(SESSION_COLLECTION).doc(sessionId);
  const snapshot = await sessionRef.get();
  if (!snapshot.exists) return;
  const batch = db.batch();
  batch.set(sessionRef, { revokedAt: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(db.collection("audit_events").doc(), buildAuditEvent({
    type: "kiosk.session.revoked", targetCollection: SESSION_COLLECTION, targetId: sessionId,
  }, req));
  await batch.commit();
}

export function kioskSessionErrorResponse(error: KioskSessionHttpError) {
  return clearKioskSessionCookies(Response.json({ error: error.message }, { status: error.status }));
}

export function assertSameOrigin(req: NextRequest) {
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new KioskSessionHttpError(403, "Origen no permitido.");
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== req.nextUrl.host) throw new KioskSessionHttpError(403, "Origen no permitido.");
    } catch (error) {
      if (error instanceof KioskSessionHttpError) throw error;
      throw new KioskSessionHttpError(403, "Origen no permitido.");
    }
  }
}
