const KIOSK_SESSION_KEYS = [
  "kiosk_employee_id",
  "kiosk_employee_name",
  "kiosk_employee_plant",
  "kiosk_first_login",
  "kiosk_terms_accepted",
  "kiosk_pin_verified",
  "kiosk_selected_item",
  "kiosk_solicitud",
  "kiosk_request_id",
  "kiosk_operation_in_progress",
];

/**
 * Clears kiosk-scoped session data after logout, timeout, cancellation,
 * completion, or any flow reset that must remove sensitive in-session values.
 */
export function clearKioskSession() {
  if (typeof window === "undefined") return;
  for (const key of KIOSK_SESSION_KEYS) {
    sessionStorage.removeItem(key);
  }
}

export function setKioskSessionBusy(isBusy: boolean) {
  if (typeof window === "undefined") return;
  if (isBusy) {
    sessionStorage.setItem("kiosk_operation_in_progress", "true");
    return;
  }
  sessionStorage.removeItem("kiosk_operation_in_progress");
}

export function isKioskSessionBusy() {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem("kiosk_operation_in_progress") === "true";
}
