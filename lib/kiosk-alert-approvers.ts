import type { AdminSession } from "./server-auth";
import type { PlantScope } from "./plants";

export const CUATITLAN_KIOSK_ALERT_APPROVERS = [
  { employeeId: "1013135", name: "Julio Cesar Vazquez Morlan" },
  { employeeId: "5412880", name: "Diego Gerardo Marquez Albor" },
  { employeeId: "3506166", name: "Leticia Abigail Dominguez Canizales" },
  { employeeId: "5839977", name: "Angel Enrique Bautista Suarez" },
  { employeeId: "5680899", name: "Adriana Sanchez Cruz" },
] as const;

const ALERT_APPROVERS_BY_PLANT: Partial<Record<PlantScope, readonly { employeeId: string; name: string }[]>> = {
  cuautitlan: CUATITLAN_KIOSK_ALERT_APPROVERS,
};

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
