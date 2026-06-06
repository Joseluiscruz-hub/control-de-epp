export function parseBooleanFlag(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return undefined;
}

export function resolveAppCheckRequired(
  runtimeValue: unknown,
  clientEnvValue: unknown,
  fallbackValue: boolean
) {
  return parseBooleanFlag(runtimeValue) ?? parseBooleanFlag(clientEnvValue) ?? fallbackValue;
}

export function shouldInitializeAppCheck(runtimeValue: unknown, clientEnvValue: unknown) {
  const runtimeRequired = parseBooleanFlag(runtimeValue);
  if (runtimeRequired !== undefined) return runtimeRequired;

  const clientEnvRequired = parseBooleanFlag(clientEnvValue);
  return clientEnvRequired === true;
}
