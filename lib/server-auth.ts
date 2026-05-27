import { NextRequest } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

export class AuthHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthHttpError";
    this.status = status;
  }
}

function getConfiguredAdminEmails() {
  const rawEmails = process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || "";
  const emails = rawEmails
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return emails.length > 0 ? emails : ["mimonkb222@gmail.com", "malvamora23@gmail.com"];
}

function getBearerToken(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AuthHttpError("Token de autenticacion requerido.", 401);
  }
  return token;
}

export async function requireAdminUser(req: NextRequest) {
  const token = getBearerToken(req);

  let decodedToken;
  try {
    decodedToken = await getAdminAuth().verifyIdToken(token);
  } catch {
    throw new AuthHttpError("Sesion invalida o expirada.", 401);
  }

  const email = decodedToken.email?.toLowerCase();
  if (!email) {
    throw new AuthHttpError("Cuenta sin email disponible.", 403);
  }

  if (!getConfiguredAdminEmails().includes(email)) {
    throw new AuthHttpError("Cuenta sin permisos administrativos.", 403);
  }

  return {
    uid: decodedToken.uid,
    email,
  };
}
