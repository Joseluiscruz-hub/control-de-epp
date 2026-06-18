import type { AdminSession } from "./server-auth";
import type { UserProfile } from "./admin-profile";
import type { PlantScope } from "./plants";

export const CUATITLAN_KIOSK_ALERT_APPROVERS = [
  { employeeId: "1013135", name: "Julio Cesar Vazquez Morlan", email: "juliocesar.vazquezm@kof.com" },
  { employeeId: "5412880", name: "Diego Gerardo Marquez Albor", email: "diego.marquez@cocacolafemsa.onmicrosoft.com" },
  { employeeId: "3506166", name: "Leticia Abigail Dominguez Canizales", email: "leticia.dominguez@kof.com" },
  { employeeId: "5680899", name: "Adriana Sanchez Cruz", email: "adriana.sanchezc@kof.com" },
] as const;

type ConfiguredAlertApprover = {
  employeeId: string;
  name: string;
  email: string;
};

const ALERT_APPROVERS_BY_PLANT: Partial<Record<PlantScope, readonly ConfiguredAlertApprover[]>> = {
  cuautitlan: CUATITLAN_KIOSK_ALERT_APPROVERS,
};

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export type KioskApprovalActor = {
  uid: string;
  email: string;
  role: AdminSession["role"];
  plantaId: AdminSession["plantaId"];
  employeeId: string | null;
  name: string;
  permissionSource: "plant_allowlist" | "explicit_permission" | "standard_admin";
};

function findPlantApprover(plantaId: PlantScope, employeeId: string | undefined) {
  if (!employeeId) return null;
  return ALERT_APPROVERS_BY_PLANT[plantaId]?.find((approver) => approver.employeeId === employeeId) ?? null;
}

export function findKioskAlertApproverByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  for (const [plantaId, approvers] of Object.entries(ALERT_APPROVERS_BY_PLANT)) {
    const approver = approvers?.find((candidate) => normalizeEmail(candidate.email) === normalizedEmail);
    if (approver) return { ...approver, plantaId: plantaId as PlantScope };
  }
  return null;
}

export function buildProvisionedKioskAlertApproverProfile(uid: string, email: string): UserProfile | null {
  const approver = findKioskAlertApproverByEmail(email);
  if (!approver || approver.plantaId === "nacional") return null;

  return {
    uid,
    email: normalizeEmail(email),
    role: "admin_local",
    plantaId: approver.plantaId,
    displayName: approver.name,
    employeeId: approver.employeeId,
    permissions: {
      canApproveKioskRequests: true,
      canApproveKioskAlerts: true,
    },
    active: true,
  };
}

export function buildKioskApprovalActor(adminUser: AdminSession, requestPlantId: PlantScope): KioskApprovalActor {
  const profileEmployeeId = adminUser.profile.employeeId;
  const configuredApprover = findPlantApprover(requestPlantId, profileEmployeeId);
  const hasExplicitPermission = adminUser.profile.permissions?.canApproveKioskAlerts === true;

  return {
    uid: adminUser.uid,
    email: adminUser.email,
    role: adminUser.role,
    plantaId: adminUser.plantaId,
    employeeId: configuredApprover?.employeeId ?? profileEmployeeId ?? null,
    name: configuredApprover?.name ?? adminUser.profile.displayName ?? adminUser.email,
    permissionSource: configuredApprover
      ? "plant_allowlist"
      : hasExplicitPermission
        ? "explicit_permission"
        : "standard_admin",
  };
}

export function canApproveKioskAlert(adminUser: AdminSession, requestPlantId: PlantScope) {
  const employeeId = adminUser.profile.employeeId;
  if (findPlantApprover(requestPlantId, employeeId)) return true;

  return (
    adminUser.profile.permissions?.canApproveKioskAlerts === true &&
    typeof employeeId === "string" &&
    employeeId.length > 0
  );
}

export function kioskAlertApproverIdsForPlant(plantaId: PlantScope) {
  return ALERT_APPROVERS_BY_PLANT[plantaId]?.map((approver) => approver.employeeId) ?? [];
}
