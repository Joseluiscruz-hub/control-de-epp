const KIOSK_SESSION_KEYS = [
  "kiosk_employee_id",
  "kiosk_employee_name",
  "kiosk_first_login",
  "kiosk_terms_accepted",
  "kiosk_pin_verified",
  "kiosk_selected_item",
  "kiosk_solicitud",
  "kiosk_request_id",
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
