export function isInsecureKioskLocalAuthEnabled(
  environment = process.env.NODE_ENV,
  configuredValue = process.env.NEXT_PUBLIC_ENABLE_INSECURE_KIOSK_LOCAL_AUTH,
) {
  return environment !== "production" && configuredValue === "true";
}
