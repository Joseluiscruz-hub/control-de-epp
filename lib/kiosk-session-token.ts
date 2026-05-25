import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

const TOKEN_VERSION = "v1";
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
const HEADER_NAME = "x-kiosk-session-token";
const DEV_SECRET = "development-kiosk-session-secret-change-me";

export interface KioskSessionClaims {
  employeeId: string;
  employeeName: string;
  issuedAt: number;
  expiresAt: number;
  version: typeof TOKEN_VERSION;
}

export class KioskSessionError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "KioskSessionError";
    this.status = status;
  }
}

function getSecret() {
  const secret = process.env.KIOSK_SESSION_SECRET;

  if (secret && secret.length >= 32) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new KioskSessionError("KIOSK_SESSION_SECRET no está configurado.", 500);
  }

  return DEV_SECRET;
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function sign(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function isValidSignature(payload: string, signature: string) {
  const expected = sign(payload);
  const actualBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");

  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isClaims(value: unknown): value is KioskSessionClaims {
  const claims = value as Partial<KioskSessionClaims>;
  return (
    typeof claims === "object" &&
    claims !== null &&
    claims.version === TOKEN_VERSION &&
    typeof claims.employeeId === "string" &&
    claims.employeeId.trim().length > 0 &&
    typeof claims.employeeName === "string" &&
    typeof claims.issuedAt === "number" &&
    typeof claims.expiresAt === "number"
  );
}

export function createKioskSessionToken(input: { employeeId: string; employeeName: string }) {
  const now = Date.now();
  const claims: KioskSessionClaims = {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_MS,
    version: TOKEN_VERSION,
  };
  const payload = encodeJson(claims);
  return `${TOKEN_VERSION}.${payload}.${sign(payload)}`;
}

export function verifyKioskSessionToken(token: string): KioskSessionClaims {
  const [version, payload, signature] = token.split(".");
  if (version !== TOKEN_VERSION || !payload || !signature) {
    throw new KioskSessionError("Sesión de kiosko inválida.");
  }

  if (!isValidSignature(payload, signature)) {
    throw new KioskSessionError("Sesión de kiosko inválida.");
  }

  let claims: unknown;
  try {
    claims = decodeJson<unknown>(payload);
  } catch {
    throw new KioskSessionError("Sesión de kiosko inválida.");
  }

  if (!isClaims(claims)) {
    throw new KioskSessionError("Sesión de kiosko inválida.");
  }

  if (claims.expiresAt <= Date.now()) {
    throw new KioskSessionError("La sesión del kiosko expiró.");
  }

  return claims;
}

export function requireKioskSession(req: NextRequest) {
  const token = req.headers.get(HEADER_NAME)?.trim();
  if (!token) {
    throw new KioskSessionError("Sesión de kiosko requerida.");
  }

  return verifyKioskSessionToken(token);
}
