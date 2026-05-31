export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getOptionalEnv(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function getFirebaseConfig() {
  const measurementId = getOptionalEnv(
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
    "FIREBASE_MEASUREMENT_ID"
  );

  return {
    apiKey: getOptionalEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "FIREBASE_API_KEY"),
    authDomain: getOptionalEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "FIREBASE_AUTH_DOMAIN"),
    projectId: getOptionalEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "FIREBASE_PROJECT_ID"),
    storageBucket: getOptionalEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: getOptionalEnv(
      "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
      "FIREBASE_MESSAGING_SENDER_ID"
    ),
    appId: getOptionalEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "FIREBASE_APP_ID"),
    ...(measurementId ? { measurementId } : {}),
    firestoreDatabaseId:
      getOptionalEnv("NEXT_PUBLIC_FIREBASE_DATABASE_ID", "FIREBASE_DATABASE_ID") || "(default)",
    appCheckSiteKey: getOptionalEnv("NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY", "FIREBASE_APPCHECK_SITE_KEY"),
  };
}

export function GET() {
  return Response.json(getFirebaseConfig(), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
