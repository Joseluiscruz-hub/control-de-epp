const KIOSK_SESSION_KEYS = [
  "kiosk_employee_id",
  "kiosk_employee_name",
  "kiosk_first_login",
  "kiosk_terms_accepted",
  "kiosk_pin_verified",
  "kiosk_session_token",
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

export function setKioskSessionToken(token: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem("kiosk_session_token", token);
}

export function getKioskSessionToken() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("kiosk_session_token") ?? "";
}

export function hasKioskSessionToken() {
  return getKioskSessionToken().length > 0;
}
