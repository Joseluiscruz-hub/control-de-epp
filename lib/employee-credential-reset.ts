export const EMPLOYEE_CREDENTIAL_RESET_ID_PATTERN = /^\d{1,12}$/;

export function normalizeEmployeeCredentialResetId(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return EMPLOYEE_CREDENTIAL_RESET_ID_PATTERN.test(normalized) ? normalized : "";
}
