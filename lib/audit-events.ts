import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";

export type AuditEventInput = {
  type: string;
  actorUid?: string;
  actorEmail?: string;
  targetCollection: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

function getClientIp(req?: NextRequest) {
  if (!req) return "";
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    ""
  );
}

function hashIp(ip: string) {
  if (!ip) return null;
  const salt = process.env.AUDIT_IP_SALT || process.env.GOOGLE_CLOUD_PROJECT || "assetguard-audit";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export function buildAuditEvent(input: AuditEventInput, req?: NextRequest) {
  return {
    type: input.type,
    actorUid: input.actorUid ?? null,
    actorEmail: input.actorEmail ?? null,
    targetCollection: input.targetCollection,
    targetId: input.targetId,
    before: input.before ?? null,
    after: input.after ?? null,
    metadata: input.metadata ?? {},
    ipHash: hashIp(getClientIp(req)),
    userAgent: req?.headers.get("user-agent") ?? null,
    createdAt: FieldValue.serverTimestamp(),
  };
}
