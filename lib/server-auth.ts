import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import type { AdminRole, UserProfile } from "@/lib/admin-profile";
import type { PlantScope } from "@/lib/plants";
import { buildBootstrapAdminProfile, normalizeUserProfile } from "@/lib/user-profile";

export class AuthHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthHttpError";
    this.status = status;
  }
}

const ENABLE_BOOTSTRAP_ADMIN = process.env.ENABLE_BOOTSTRAP_ADMIN === "true";
const BOOTSTRAP_ADMIN_EMAIL = (process.env.BOOTSTRAP_ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();

export type AdminSession = {
  uid: string;
  email: string;
  role: AdminRole;
  plantaId: PlantScope;
  profile: UserProfile;
};

function getBearerToken(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new AuthHttpError("Token de autenticacion requerido.", 401);
  }
  return token;
}

async function readUserProfile(uid: string, email: string) {
  try {
    const snap = await getAdminDb().collection("users").doc(uid).get();
    if (!snap.exists) return null;
    return normalizeUserProfile(uid, email, snap.data() ?? {});
  } catch (error) {
    console.warn("[Server auth profile read failed]", error);
    return null;
  }
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

  const profile = await readUserProfile(decodedToken.uid, email);
  if (profile?.active === false) {
    throw new AuthHttpError("Cuenta administrativa desactivada.", 403);
  }

  if (profile?.role === "admin_local" || profile?.role === "admin_global") {
    return {
      uid: decodedToken.uid,
      email,
      role: profile.role,
      plantaId: profile.plantaId,
      profile,
    } satisfies AdminSession;
  }

  const bootstrapProfile = buildBootstrapAdminProfile(
    {
      uid: decodedToken.uid,
      email,
      displayName: typeof decodedToken.name === "string" ? decodedToken.name : undefined,
    },
    { enabled: ENABLE_BOOTSTRAP_ADMIN, email: BOOTSTRAP_ADMIN_EMAIL }
  );

  if (!bootstrapProfile) {
    throw new AuthHttpError("Cuenta sin permisos administrativos.", 403);
  }

  return {
    uid: decodedToken.uid,
    email,
    role: bootstrapProfile.role,
    plantaId: bootstrapProfile.plantaId,
    profile: bootstrapProfile,
  } satisfies AdminSession;
}

export async function requireGlobalAdminUser(req: NextRequest) {
  const adminUser = await requireAdminUser(req);
  if (adminUser.role !== "admin_global") {
    throw new AuthHttpError("Solo un administrador global puede realizar esta accion.", 403);
  }
  return adminUser;
}

export function canAdminUsePlant(adminUser: AdminSession, plantaId: string | null | undefined) {
  return adminUser.role === "admin_global" || !plantaId || adminUser.plantaId === plantaId;
}
