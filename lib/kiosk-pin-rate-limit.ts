import { createHash, randomBytes } from "crypto";
import { FieldValue, type DocumentData, type Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

const COLLECTION = "kiosk_pin_rate_limits";
export const KIOSK_PIN_CLIENT_COOKIE = "assetguard_kiosk_client";
const KIOSK_PIN_CLIENT_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
const EMPLOYEE_POLICY = {
  maxFailedAttempts: 15,
  windowMs: 24 * 60 * 60 * 1000,
};
const CLIENT_POLICY = {
  maxFailedAttempts: 25,
  windowMs: 10 * 60 * 1000,
  blockMs: 10 * 60 * 1000,
};

export type KioskPinRateLimitScope = "setup" | "verify";
export type KioskPinRateLimitPolicyName = "employee" | "client";

export interface KioskPinRateLimitStatus {
  blocked: boolean;
  adminUnlockRequired: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
}

function getClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  return forwardedFor || realIp || "unknown";
}

export function selectKioskPinPrecheckBlock(
  employeeStatus: KioskPinRateLimitStatus,
  _clientStatus: KioskPinRateLimitStatus,
) {
  // Only an employee-specific block may reject before credential verification.
  // A shared client/device block is enforced after an invalid credential, so a
  // legitimate employee never inherits another person's failures.
  return employeeStatus.blocked ? employeeStatus : null;
}

function readKioskPinClientId(req: NextRequest) {
  const value = req.cookies.get(KIOSK_PIN_CLIENT_COOKIE)?.value?.trim() ?? "";
  return /^[A-Za-z0-9_-]{32,128}$/.test(value) ? value : "";
}

function kioskPinClientCookie(value: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${KIOSK_PIN_CLIENT_COOKIE}=${encodeURIComponent(value)}; Path=/api/kiosk; HttpOnly; SameSite=Strict; Max-Age=${KIOSK_PIN_CLIENT_COOKIE_MAX_AGE}${secure}`;
}

export function attachKioskPinClientCookie(req: NextRequest, response: Response) {
  if (!readKioskPinClientId(req)) {
    response.headers.append("Set-Cookie", kioskPinClientCookie(randomBytes(32).toString("base64url")));
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function getPolicy(policy: KioskPinRateLimitPolicyName) {
  return policy === "client" ? CLIENT_POLICY : EMPLOYEE_POLICY;
}

export function getKioskPinRateLimitKey(req: NextRequest, employeeId: string, scope: KioskPinRateLimitScope) {
  const employee = employeeId.trim().toLowerCase();
  const salt = process.env.AUDIT_IP_SALT || process.env.GOOGLE_CLOUD_PROJECT || "assetguard-kiosk-pin";
  return `employee_${createHash("sha256").update(`${salt}:${scope}:${employee}`).digest("hex")}`;
}

export function getKioskPinClientRateLimitKey(req: NextRequest, scope: KioskPinRateLimitScope) {
  const ip = getClientIp(req);
  const clientId = readKioskPinClientId(req);
  const identity = clientId ? `device:${clientId}:ip:${ip}` : `ip:${ip}`;
  const salt = process.env.AUDIT_IP_SALT || process.env.GOOGLE_CLOUD_PROJECT || "assetguard-kiosk-pin";
  return `client_${createHash("sha256").update(`${salt}:${scope}:${identity}`).digest("hex")}`;
}

export function getKioskPinRateLimitStatus(
  data: DocumentData | undefined,
  policyName: KioskPinRateLimitPolicyName,
  now = Date.now()
): KioskPinRateLimitStatus {
  const policy = getPolicy(policyName);
  if (!data) {
    return { blocked: false, adminUnlockRequired: false, retryAfterSeconds: 0, remainingAttempts: policy.maxFailedAttempts };
  }

  if (data.adminUnlockRequired === true) {
    return { blocked: true, adminUnlockRequired: true, retryAfterSeconds: 0, remainingAttempts: 0 };
  }

  const blockedUntil = Number(data.blockedUntil ?? 0);
  if (Number.isFinite(blockedUntil) && blockedUntil > now) {
    return {
      blocked: true,
      adminUnlockRequired: false,
      retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000),
      remainingAttempts: 0,
    };
  }

  const windowExpiresAt = Number(data.windowExpiresAt ?? 0);
  if (!Number.isFinite(windowExpiresAt) || windowExpiresAt <= now) {
    return { blocked: false, adminUnlockRequired: false, retryAfterSeconds: 0, remainingAttempts: policy.maxFailedAttempts };
  }

  const failedAttempts = Math.max(0, Number(data.failedAttempts ?? 0));
  return {
    blocked: false,
    adminUnlockRequired: false,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, policy.maxFailedAttempts - failedAttempts),
  };
}

export async function assertKioskPinRateLimit(
  db: Firestore,
  key: string,
  policyName: KioskPinRateLimitPolicyName = "employee"
) {
  const snapshot = await db.collection(COLLECTION).doc(key).get();
  return getKioskPinRateLimitStatus(snapshot.exists ? snapshot.data() : undefined, policyName);
}

export async function registerKioskPinFailure(
  db: Firestore,
  key: string,
  scope: KioskPinRateLimitScope,
  policyName: KioskPinRateLimitPolicyName = "employee"
) {
  const ref = db.collection(COLLECTION).doc(key);

  return db.runTransaction(async (transaction) => {
    const now = Date.now();
    const policy = getPolicy(policyName);
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : undefined;
    const currentStatus = getKioskPinRateLimitStatus(data, policyName, now);

    if (currentStatus.blocked) return currentStatus;

    const currentWindowExpiresAt = Number(data?.windowExpiresAt ?? 0);
    const withinWindow = Number.isFinite(currentWindowExpiresAt) && currentWindowExpiresAt > now;
    const failedAttempts = withinWindow ? Math.max(0, Number(data?.failedAttempts ?? 0)) + 1 : 1;
    const windowExpiresAt = withinWindow ? currentWindowExpiresAt : now + policy.windowMs;
    const adminUnlockRequired = policyName === "employee" && failedAttempts >= 15;
    const blockMs = policyName === "client"
      ? CLIENT_POLICY.blockMs
      : failedAttempts >= 10
        ? 30 * 60 * 1000
        : failedAttempts >= 5
          ? 5 * 60 * 1000
          : 0;
    const blockedUntil = !adminUnlockRequired && blockMs > 0 ? now + blockMs : 0;

    transaction.set(
      ref,
      {
        scope,
        policy: policyName,
        failedAttempts,
        windowExpiresAt,
        blockedUntil,
        adminUnlockRequired,
        updatedAt: FieldValue.serverTimestamp(),
        ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );

    return getKioskPinRateLimitStatus({ failedAttempts, windowExpiresAt, blockedUntil, adminUnlockRequired }, policyName, now);
  });
}

export async function clearKioskPinFailures(db: Firestore, key: string) {
  await db.collection(COLLECTION).doc(key).delete().catch(() => undefined);
}

export async function clearKioskPinEmployeeFailures(db: Firestore, req: NextRequest, employeeId: string) {
  await Promise.all([
    clearKioskPinFailures(db, getKioskPinRateLimitKey(req, employeeId, "verify")),
    clearKioskPinFailures(db, getKioskPinRateLimitKey(req, employeeId, "setup")),
  ]);
}

export function kioskPinRateLimitResponse(status: KioskPinRateLimitStatus, includeValid = false) {
  if (status.adminUnlockRequired) {
    return Response.json(
      {
        ...(includeValid ? { valid: false } : {}),
        error: "El acceso esta bloqueado. Solicita desbloqueo administrativo.",
        adminUnlockRequired: true,
      },
      { status: 423 }
    );
  }
  const seconds = Math.max(1, status.retryAfterSeconds);
  return Response.json(
    {
      ...(includeValid ? { valid: false } : {}),
      error: `Demasiados intentos fallidos. Intenta de nuevo en ${seconds} segundos.`,
      retryAfterSeconds: seconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(seconds),
      },
    }
  );
}
