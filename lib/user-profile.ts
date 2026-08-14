import type { AdminPermissions, AdminRole, UserProfile } from "@/lib/admin-profile";
import { DEFAULT_PLANT_ID, isPlantId, type PlantScope } from "@/lib/plants";

export type ProfileUserLike = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
};

export type BootstrapAdminConfig = {
  enabled: boolean;
  email?: string | null;
};

export function normalizeAdminEmployeeId(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return /^\d{1,12}$/.test(trimmed) ? trimmed : undefined;
}

function normalizePermissions(value: unknown): AdminPermissions | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const permissions: AdminPermissions = {};

  if (input.canApproveKioskRequests === true) permissions.canApproveKioskRequests = true;
  if (input.canApproveKioskAlerts === true) permissions.canApproveKioskAlerts = true;

  return Object.keys(permissions).length > 0 ? permissions : undefined;
}

export function normalizeUserProfile(uid: string, fallbackEmail: string, data: Record<string, unknown>): UserProfile | null {
  const role = data.role === "admin_local" || data.role === "admin_global" ? data.role as AdminRole : null;
  if (!role) return null;

  const rawPlant = typeof data.plantaId === "string" ? data.plantaId : "";
  const plantaId: PlantScope = role === "admin_global"
    ? (rawPlant === "nacional" || isPlantId(rawPlant) ? rawPlant : "nacional")
    : isPlantId(rawPlant) ? rawPlant : DEFAULT_PLANT_ID;

  const employeeId = normalizeAdminEmployeeId(data.employeeId);
  const permissions = normalizePermissions(data.permissions);

  return {
    uid,
    email: typeof data.email === "string" && data.email ? data.email.toLowerCase() : fallbackEmail,
    role,
    plantaId,
    displayName: typeof data.displayName === "string" ? data.displayName : undefined,
    ...(employeeId ? { employeeId } : {}),
    ...(permissions ? { permissions } : {}),
    active: data.active !== false,
  };
}

export function isConfiguredBootstrapAdminEmail(email: string | null | undefined, config: BootstrapAdminConfig) {
  const configuredEmail = config.email?.trim().toLowerCase();
  return config.enabled && !!email && !!configuredEmail && email.toLowerCase() === configuredEmail;
}

export function buildBootstrapAdminProfile(user: ProfileUserLike, config: BootstrapAdminConfig): UserProfile | null {
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
