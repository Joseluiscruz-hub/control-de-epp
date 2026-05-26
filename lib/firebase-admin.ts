import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getProjectId() {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT
  );
}

function getDatabaseId() {
  const databaseId = process.env.FIREBASE_DATABASE_ID || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID;
  return databaseId && databaseId !== "(default)" ? databaseId : undefined;
}

function getCredential() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    return cert(JSON.parse(serviceAccountJson));
  }
  return applicationDefault();
}

function getAdminApp() {
  const existing = getApps()[0];
  if (existing) return existing;

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error("Missing FIREBASE_PROJECT_ID/NEXT_PUBLIC_FIREBASE_PROJECT_ID for Firebase Admin.");
  }

  return initializeApp({
    credential: getCredential(),
    projectId,
  });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  const app = getAdminApp();
  const databaseId = getDatabaseId();
  return databaseId ? getFirestore(app, databaseId) : getFirestore(app);
}
