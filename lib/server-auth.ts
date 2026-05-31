import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import type { AdminRole, UserProfile } from "@/lib/admin-profile";
import { isPlantId, type PlantScope } from "@/lib/plants";

export class AuthHttpError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthHttpError";
    this.status = status;
  }
}

const ENABLE_BOOTSTRAP_ADMIN = process.env.ENABLE_BOOTSTRAP_ADMIN === "true";
const BOOTSTRAP_ADMIN_EMAIL = (process.env.BOOTSTRAP_ADMIN_EMAIL || process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();

function isBootstrapAdminEmail(email: string) {
  return ENABLE_BOOTSTRAP_ADMIN && !!BOOTSTRAP_ADMIN_EMAIL && email === BOOTSTRAP_ADMIN_EMAIL;
}

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

function normalizeProfile(uid: string, fallbackEmail: string, data: FirebaseFirestore.DocumentData): UserProfile | null {
  const role = data.role === "admin_local" || data.role === "admin_global"
    ? data.role as AdminRole
    : null;
  if (!role) return null;

  const rawPlant = typeof data.plantaId === "string" ? data.plantaId : "";
  const plantaId: PlantScope = role === "admin_global"
    ? (rawPlant === "nacional" || isPlantId(rawPlant) ? rawPlant : "nacional")
    : isPlantId(rawPlant)
      ? rawPlant
      : "cuautitlan";

  return {
    uid,
    email: typeof data.email === "string" && data.email ? data.email.toLowerCase() : fallbackEmail,
    role,
    plantaId,
    displayName: typeof data.displayName === "string" ? data.displayName : undefined,
    active: data.active !== false,
  };
}

async function readUserProfile(uid: string, email: string) {
  try {
    const snap = await getAdminDb().collection("users").doc(uid).get();
    if (!snap.exists) return null;
    return normalizeProfile(uid, email, snap.data() ?? {});
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

  if (!isBootstrapAdminEmail(email)) {
    throw new AuthHttpError("Cuenta sin permisos administrativos.", 403);
  }

  return {
    uid: decodedToken.uid,
    email,
    role: "admin_global" as const,
    plantaId: "nacional" as const,
    profile: {
      uid: decodedToken.uid,
      email,
      role: "admin_global" as const,
      plantaId: "nacional" as const,
      active: true,
    },
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
