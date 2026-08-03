import { createHash } from "crypto";
import { FieldValue, type DocumentData, type Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

const COLLECTION = "kiosk_pin_rate_limits";
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
  return `client_${createHash("sha256").update(`${scope}:${ip}`).digest("hex")}`;
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
