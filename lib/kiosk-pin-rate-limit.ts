import { createHash } from "crypto";
import { FieldValue, type DocumentData, type Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

const COLLECTION = "kiosk_pin_rate_limits";
const EMPLOYEE_POLICY = {
  maxFailedAttempts: 5,
  windowMs: 10 * 60 * 1000,
  blockMs: 10 * 60 * 1000,
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
  const ip = getClientIp(req);
  return `employee_${createHash("sha256").update(`${scope}:${employee}:${ip}`).digest("hex")}`;
}

export function getKioskPinClientRateLimitKey(req: NextRequest, scope: KioskPinRateLimitScope) {
  const ip = getClientIp(req);
  return `client_${createHash("sha256").update(`${scope}:${ip}`).digest("hex")}`;
}

function getStatus(
  data: DocumentData | undefined,
  policyName: KioskPinRateLimitPolicyName,
  now = Date.now()
): KioskPinRateLimitStatus {
  const policy = getPolicy(policyName);
  if (!data) {
    return { blocked: false, retryAfterSeconds: 0, remainingAttempts: policy.maxFailedAttempts };
  }

  const blockedUntil = Number(data.blockedUntil ?? 0);
  if (Number.isFinite(blockedUntil) && blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil((blockedUntil - now) / 1000),
      remainingAttempts: 0,
    };
  }

  const windowExpiresAt = Number(data.windowExpiresAt ?? 0);
  if (!Number.isFinite(windowExpiresAt) || windowExpiresAt <= now) {
    return { blocked: false, retryAfterSeconds: 0, remainingAttempts: policy.maxFailedAttempts };
  }

  const failedAttempts = Math.max(0, Number(data.failedAttempts ?? 0));
  return {
    blocked: false,
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
  return getStatus(snapshot.exists ? snapshot.data() : undefined, policyName);
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
    const currentStatus = getStatus(data, policyName, now);

    if (currentStatus.blocked) return currentStatus;

    const currentWindowExpiresAt = Number(data?.windowExpiresAt ?? 0);
    const withinWindow = Number.isFinite(currentWindowExpiresAt) && currentWindowExpiresAt > now;
    const failedAttempts = withinWindow ? Math.max(0, Number(data?.failedAttempts ?? 0)) + 1 : 1;
    const windowExpiresAt = withinWindow ? currentWindowExpiresAt : now + policy.windowMs;
    const blockedUntil = failedAttempts >= policy.maxFailedAttempts ? now + policy.blockMs : 0;

    transaction.set(
      ref,
      {
        scope,
        policy: policyName,
        failedAttempts,
        windowExpiresAt,
        blockedUntil,
        updatedAt: FieldValue.serverTimestamp(),
        ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );

    return getStatus({ failedAttempts, windowExpiresAt, blockedUntil }, policyName, now);
  });
}

export async function clearKioskPinFailures(db: Firestore, key: string) {
  await db.collection(COLLECTION).doc(key).delete().catch(() => undefined);
}

export function kioskPinRateLimitResponse(status: KioskPinRateLimitStatus, includeValid = false) {
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
