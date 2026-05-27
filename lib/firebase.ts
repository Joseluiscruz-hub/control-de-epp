import { initializeApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

type FirebaseAppConfig = FirebaseOptions & {
  firestoreDatabaseId: string;
};

type RuntimeFirebaseConfig = Partial<FirebaseOptions> & {
  firestoreDatabaseId?: string;
};

declare global {
  interface Window {
    __ASSETGUARD_FIREBASE_CONFIG__?: RuntimeFirebaseConfig;
  }
}

function getRuntimeConfig() {
  if (typeof window === 'undefined') return undefined;
  return window.__ASSETGUARD_FIREBASE_CONFIG__;
}

function getFirebaseConfig(): FirebaseAppConfig {
  const runtimeConfig = getRuntimeConfig();
  const measurementId =
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ??
    runtimeConfig?.measurementId ??
    '';
  const firestoreDatabaseId =
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ??
    runtimeConfig?.firestoreDatabaseId;

  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? runtimeConfig?.apiKey ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? runtimeConfig?.authDomain ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? runtimeConfig?.projectId ?? '',
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? runtimeConfig?.storageBucket ?? '',
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ??
      runtimeConfig?.messagingSenderId ??
      '',
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? runtimeConfig?.appId ?? '',
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
