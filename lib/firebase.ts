import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

type FirebaseAppConfig = FirebaseOptions & {
  firestoreDatabaseId: string;
};

function getFirebaseConfig(): FirebaseAppConfig {
  const measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? '';
  const firestoreDatabaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID;
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
    ...(measurementId ? { measurementId } : {}),
    firestoreDatabaseId:
      firestoreDatabaseId && firestoreDatabaseId !== '(default)'
        ? firestoreDatabaseId
        : '(default)',
  };
}

// Lazy singleton — Firebase is initialized on first access, not at module import time.
// This prevents build-time errors when NEXT_PUBLIC_* env vars are unavailable during SSG.
let _initialized = false;

function ensureInitialized() {
  if (_initialized) return;
  if (getApps().length === 0) {
    const config = getFirebaseConfig();
    if (!config.apiKey) {
      // Running in build/SSG context without env vars — skip initialization
      return;
    }
    initializeApp(config);
  }
  _initialized = true;
}

ensureInitialized();

export const auth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_target, prop) {
    ensureInitialized();
    const app = getApps()[0];
    if (!app) throw new Error('Firebase app not initialized. Check NEXT_PUBLIC_FIREBASE_* env vars.');
    return (getAuth(app) as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const db = new Proxy({} as ReturnType<typeof getFirestore>, {
  get(_target, prop) {
    ensureInitialized();
    const app = getApps()[0];
    if (!app) throw new Error('Firebase app not initialized. Check NEXT_PUBLIC_FIREBASE_* env vars.');
    return (getFirestore(app) as unknown as Record<string | symbol, unknown>)[prop];
  },
});
