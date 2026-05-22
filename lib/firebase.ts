import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

type FirebaseAppConfig = FirebaseOptions & {
  firestoreDatabaseId: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env.local and set Firebase config values.`);
  }
  return value;
}

function getFirebaseConfig(): FirebaseAppConfig {
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '';
  const firestoreDatabaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID;

  return {
    apiKey: requiredEnv('NEXT_PUBLIC_FIREBASE_API_KEY'),
    authDomain: requiredEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: requiredEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: requiredEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: requiredEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: requiredEnv('NEXT_PUBLIC_FIREBASE_APP_ID'),
    ...(measurementId ? { measurementId } : {}),
    firestoreDatabaseId:
      firestoreDatabaseId && firestoreDatabaseId !== '(default)'
        ? firestoreDatabaseId
        : '(default)',
  };
}

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
