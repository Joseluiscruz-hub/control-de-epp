import { createHash } from "crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

const COLLECTION = "public_api_rate_limits";

type PublicRateLimitPolicy = {
  maxRequests: number;
  windowMs: number;
  blockMs: number;
};

const POLICIES: Record<string, PublicRateLimitPolicy> = {
  kiosk_employee_lookup: { maxRequests: 40, windowMs: 10 * 60 * 1000, blockMs: 10 * 60 * 1000 },
  portal_employee_lookup: { maxRequests: 30, windowMs: 10 * 60 * 1000, blockMs: 10 * 60 * 1000 },
  kiosk_request_create: { maxRequests: 20, windowMs: 10 * 60 * 1000, blockMs: 10 * 60 * 1000 },
  kiosk_assignment_lookup: { maxRequests: 40, windowMs: 10 * 60 * 1000, blockMs: 10 * 60 * 1000 },
  kiosk_request_status: { maxRequests: 60, windowMs: 10 * 60 * 1000, blockMs: 10 * 60 * 1000 },
};

export class PublicRateLimitHttpError extends Error {
  status = 429;
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Demasiadas solicitudes. Intenta de nuevo en ${retryAfterSeconds} segundos.`);
    this.name = "PublicRateLimitHttpError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function getClientIp(req: NextRequest) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function rateLimitKey(req: NextRequest, scope: keyof typeof POLICIES) {
  const ip = getClientIp(req);
  const salt = process.env.AUDIT_IP_SALT || process.env.GOOGLE_CLOUD_PROJECT || "assetguard-public-rate-limit";
  return createHash("sha256").update(`${salt}:${scope}:${ip}`).digest("hex");
}

export async function requirePublicRateLimit(
  db: Firestore,
  req: NextRequest,
  scope: keyof typeof POLICIES
) {
  const policy = POLICIES[scope];
  const ref = db.collection(COLLECTION).doc(`${scope}_${rateLimitKey(req, scope)}`);

  const retryAfterSeconds = await db.runTransaction(async (transaction) => {
    const now = Date.now();
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() ?? {} : {};
    const blockedUntil = Number(data.blockedUntil ?? 0);

    if (Number.isFinite(blockedUntil) && blockedUntil > now) {
      return Math.ceil((blockedUntil - now) / 1000);
    }

    const windowExpiresAt = Number(data.windowExpiresAt ?? 0);
    const withinWindow = Number.isFinite(windowExpiresAt) && windowExpiresAt > now;
    const requestCount = withinWindow ? Math.max(0, Number(data.requestCount ?? 0)) + 1 : 1;
    const nextWindowExpiresAt = withinWindow ? windowExpiresAt : now + policy.windowMs;
    const nextBlockedUntil = requestCount > policy.maxRequests ? now + policy.blockMs : 0;

    transaction.set(
      ref,
      {
        scope,
        requestCount,
        windowExpiresAt: nextWindowExpiresAt,
        blockedUntil: nextBlockedUntil,
        updatedAt: FieldValue.serverTimestamp(),
        ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );

    return nextBlockedUntil > now ? Math.ceil((nextBlockedUntil - now) / 1000) : 0;
  });

  if (retryAfterSeconds > 0) {
    throw new PublicRateLimitHttpError(retryAfterSeconds);
  }
}

export function publicRateLimitResponse(error: PublicRateLimitHttpError) {
  return Response.json(
    {
      error: error.message,
      retryAfterSeconds: error.retryAfterSeconds,
    },
    {
      status: error.status,
      headers: {
        "Retry-After": String(error.retryAfterSeconds),
      },
    }
  );
}
