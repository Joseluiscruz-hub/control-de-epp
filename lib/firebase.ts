import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
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

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? '';
}

function getFirebaseConfig(): FirebaseAppConfig {
  const runtimeConfig = getRuntimeConfig();
  const measurementId = firstNonEmpty(
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    runtimeConfig?.measurementId
  );
  const firestoreDatabaseId = firstNonEmpty(
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID,
    runtimeConfig?.firestoreDatabaseId
  );

  return {
    apiKey: firstNonEmpty(process.env.NEXT_PUBLIC_FIREBASE_API_KEY, runtimeConfig?.apiKey),
    authDomain: firstNonEmpty(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, runtimeConfig?.authDomain),
    projectId: firstNonEmpty(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, runtimeConfig?.projectId),
    storageBucket: firstNonEmpty(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, runtimeConfig?.storageBucket),
    messagingSenderId: firstNonEmpty(
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      runtimeConfig?.messagingSenderId
    ),
    appId: firstNonEmpty(process.env.NEXT_PUBLIC_FIREBASE_APP_ID, runtimeConfig?.appId),
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
let _initPromise: Promise<void> | null = null;
let _firestoreDatabaseId = '(default)';

function hasRequiredConfig(config: FirebaseAppConfig) {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

function initializeWithConfig(config: FirebaseAppConfig) {
  if (_initialized || getApps().length > 0) {
    _initialized = true;
    _firestoreDatabaseId = config.firestoreDatabaseId;
    return true;
  }

  if (!hasRequiredConfig(config)) return false;

  initializeApp(config);
  _initialized = true;
  _firestoreDatabaseId = config.firestoreDatabaseId;
  return true;
}

function ensureInitialized() {
  if (_initialized || getApps().length > 0) {
    _initialized = true;
    return true;
  }

  return initializeWithConfig(getFirebaseConfig());
}

async function loadRuntimeConfig() {
  if (typeof window === 'undefined') return;

  if (getRuntimeConfig()?.apiKey) return;

  const response = await fetch('/firebase-config.json', {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Firebase config request failed with status ${response.status}`);
  }

  window.__ASSETGUARD_FIREBASE_CONFIG__ = (await response.json()) as RuntimeFirebaseConfig;
}

export async function ensureFirebaseReady() {
  if (ensureInitialized()) return;
  if (typeof window === 'undefined') return;

  _initPromise ??= (async () => {
    await loadRuntimeConfig();
    if (!ensureInitialized()) {
      throw new Error('Firebase app not initialized. Check NEXT_PUBLIC_FIREBASE_* env vars.');
    }
  })().catch((error) => {
    _initPromise = null;
    throw error;
  });

  await _initPromise;
}

function getInitializedApp(): FirebaseApp {
  ensureInitialized();
  const app = getApps()[0];
  if (!app) {
    throw new Error('Firebase app not initialized. Call ensureFirebaseReady() before using Firebase.');
  }
  return app;
}

function getInitializedFirestore() {
  const app = getInitializedApp();
  return _firestoreDatabaseId && _firestoreDatabaseId !== '(default)'
    ? getFirestore(app, _firestoreDatabaseId)
    : getFirestore(app);
}

function initializeFromStaticConfig() {
  if (getApps().length === 0) {
    ensureInitialized();
  }
}

initializeFromStaticConfig();

export const auth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_target, prop) {
    return (getAuth(getInitializedApp()) as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const db = new Proxy({} as ReturnType<typeof getFirestore>, {
  get(_target, prop) {
    return (getInitializedFirestore() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
