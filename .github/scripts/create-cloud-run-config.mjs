import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";


function requiredEnv(name) {
  const value = (process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`Missing required GitHub environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name, fallback = "") {
  return (process.env[name] ?? "").trim() || fallback;
}

function writeYaml(path, values) {
  const content = Object.entries(values)
    .map(([key, value]) => `${key}: '${String(value).replaceAll("'", "''")}'`)
    .join("\n");
  writeFileSync(path, `${content}\n`, "utf8");
}

const projectId = requiredEnv("PROJECT_ID");
const firebaseProjectId = requiredEnv("FIREBASE_PROJECT_ID");
const databaseId = requiredEnv("FIREBASE_DATABASE_ID");
const deploymentEnvironment = requiredEnv("DEPLOYMENT_ENVIRONMENT");
const expectedDeploymentEnvironment = requiredEnv("EXPECTED_DEPLOYMENT_ENVIRONMENT");
const deploymentTempDir = optionalEnv("DEPLOYMENT_TEMP_DIR", "/tmp");

if (deploymentEnvironment !== expectedDeploymentEnvironment) {
  throw new Error(
    `Expected GitHub environment ${expectedDeploymentEnvironment}, received ${deploymentEnvironment}.`,
  );
}

if (projectId !== firebaseProjectId) {
  throw new Error(
    "GCP_PROJECT_ID and FIREBASE_PROJECT_ID must match to prevent a cross-project deployment.",
  );
}

const appCheckRequired = optionalEnv("FIREBASE_APP_CHECK_REQUIRED", "true").toLowerCase() === "true";
const appCheckSiteKey = optionalEnv("FIREBASE_APPCHECK_SITE_KEY");
if (appCheckRequired && !appCheckSiteKey) {
  throw new Error(
    "FIREBASE_APPCHECK_SITE_KEY is required when FIREBASE_APP_CHECK_REQUIRED is true.",
  );
}

const firebaseValues = {
  API_KEY: requiredEnv("FIREBASE_API_KEY"),
  AUTH_DOMAIN: requiredEnv("FIREBASE_AUTH_DOMAIN"),
  PROJECT_ID: firebaseProjectId,
  STORAGE_BUCKET: requiredEnv("FIREBASE_STORAGE_BUCKET"),
  MESSAGING_SENDER_ID: requiredEnv("FIREBASE_MESSAGING_SENDER_ID"),
  APP_ID: requiredEnv("FIREBASE_APP_ID"),
  DATABASE_ID: databaseId,
};

const buildVars = Object.fromEntries(
  Object.entries(firebaseValues).map(([key, value]) => [`NEXT_PUBLIC_FIREBASE_${key}`, value]),
);
Object.assign(buildVars, {
  NEXT_PUBLIC_ENABLE_OFFLINE_MODE: optionalEnv("NEXT_PUBLIC_ENABLE_OFFLINE_MODE", "false"),
  NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY: appCheckSiteKey,
  NEXT_PUBLIC_FIREBASE_APP_CHECK_REQUIRED: String(appCheckRequired),
});

const runtimeVars = {
  NODE_ENV: "production",
  ...Object.fromEntries(
    Object.entries(firebaseValues).map(([key, value]) => [`FIREBASE_${key}`, value]),
  ),
  ENABLE_BOOTSTRAP_ADMIN: optionalEnv("ENABLE_BOOTSTRAP_ADMIN", "false"),
  BOOTSTRAP_ADMIN_EMAIL: optionalEnv("BOOTSTRAP_ADMIN_EMAIL"),
  FIREBASE_APPCHECK_SITE_KEY: appCheckSiteKey,
  FIREBASE_APP_CHECK_REQUIRED: String(appCheckRequired),
  NEXT_PUBLIC_FIREBASE_APP_CHECK_REQUIRED: String(appCheckRequired),
};

const measurementId = optionalEnv("FIREBASE_MEASUREMENT_ID");
if (measurementId) {
  buildVars.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID = measurementId;
  runtimeVars.FIREBASE_MEASUREMENT_ID = measurementId;
}

mkdirSync(deploymentTempDir, { recursive: true });
writeYaml(join(deploymentTempDir, "build-env-vars.yaml"), buildVars);
writeYaml(join(deploymentTempDir, "runtime-env-vars.yaml"), runtimeVars);

writeFileSync(
  ".firebase.deploy.json",
  `${JSON.stringify({
    firestore: [
      {
        database: databaseId,
        rules: "firestore.rules",
      },
    ],
  }, null, 2)}\n`,
  "utf8",
);

console.log(
  `Deployment configuration created for ${deploymentEnvironment}: ${projectId}/${databaseId}.`,
);
