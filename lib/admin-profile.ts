import type { PlantScope } from "@/lib/plants";

export type AdminRole = "admin_local" | "admin_global";

export interface AdminPermissions {
  canApproveKioskRequests?: boolean;
  canApproveKioskAlerts?: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: AdminRole;
  plantaId: PlantScope;
  displayName?: string;
  employeeId?: string;
  permissions?: AdminPermissions;
  active?: boolean;
}

export function isGlobalProfile(profile: UserProfile | null | undefined) {
  return profile?.role === "admin_global" && profile.active !== false;
}

export function isLocalProfile(profile: UserProfile | null | undefined) {
  return profile?.role === "admin_local" && profile.active !== false;
}

export function canUseAdminProfile(profile: UserProfile | null | undefined) {
  return isGlobalProfile(profile) || isLocalProfile(profile);
}
