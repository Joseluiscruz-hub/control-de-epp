import type { AdminRole, UserProfile } from "@/lib/admin-profile";
import { isPlantId, type PlantScope } from "@/lib/plants";

export type ProfileUserLike = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
};

export type BootstrapAdminConfig = {
  enabled: boolean;
  email?: string | null;
};

export function normalizeUserProfile(
  uid: string,
  fallbackEmail: string,
  data: Record<string, unknown>
): UserProfile | null {
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

export function isConfiguredBootstrapAdminEmail(email: string | null | undefined, config: BootstrapAdminConfig) {
  const configuredEmail = config.email?.trim().toLowerCase();
  return config.enabled && !!email && !!configuredEmail && email.toLowerCase() === configuredEmail;
}

export function buildBootstrapAdminProfile(
  user: ProfileUserLike,
  config: BootstrapAdminConfig
): UserProfile | null {
  const email = user.email?.toLowerCase();
  if (!email || !isConfiguredBootstrapAdminEmail(email, config)) return null;

  return {
    uid: user.uid,
    email,
    role: "admin_global",
    plantaId: "nacional",
    displayName: user.displayName ?? undefined,
    active: true,
  };
}
