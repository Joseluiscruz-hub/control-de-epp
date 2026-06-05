export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBooleanEnv(defaultValue: boolean, ...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(value ?? "")) return true;
    if (["false", "0", "no", "off"].includes(value ?? "")) return false;
  }
  return defaultValue;
}

function getFirebaseConfig() {
  const measurementId =
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ||
    process.env.FIREBASE_MEASUREMENT_ID ||
    "";

  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "",
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      process.env.FIREBASE_STORAGE_BUCKET ||
      "",
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
      process.env.FIREBASE_MESSAGING_SENDER_ID ||
      "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "",
    ...(measurementId ? { measurementId } : {}),
    firestoreDatabaseId:
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ||
      process.env.FIREBASE_DATABASE_ID ||
      "(default)",
    appCheckSiteKey:
      process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY ||
      process.env.FIREBASE_APPCHECK_SITE_KEY ||
      "",
    appCheckRequired: getBooleanEnv(true, "NEXT_PUBLIC_FIREBASE_APP_CHECK_REQUIRED", "FIREBASE_APP_CHECK_REQUIRED"),
  };
}

export function GET() {
  const body = `window.__ASSETGUARD_FIREBASE_CONFIG__=${JSON.stringify(getFirebaseConfig()).replace(/</g, "\\u003c")};`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
