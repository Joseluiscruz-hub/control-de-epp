import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getToken, initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { resolveAppCheckRequired, shouldInitializeAppCheck } from './app-check-flags';

type FirebaseAppConfig = FirebaseOptions & {
  firestoreDatabaseId: string;
};

type RuntimeFirebaseConfig = Partial<FirebaseOptions> & {
  firestoreDatabaseId?: string;
  appCheckSiteKey?: string;
  appCheckRequired?: boolean | string;
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

export function isAppCheckRequiredForClient() {
  return resolveAppCheckRequired(
    getRuntimeConfig()?.appCheckRequired,
    process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_REQUIRED,
    process.env.NODE_ENV === 'production'
  );
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
let _runtimeConfigPromise: Promise<void> | null = null;
let _firestoreDatabaseId = '(default)';
let _appCheck: AppCheck | null = null;
let _appCheckInitWarningShown = false;
let _appCheckTokenWarningShown = false;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasRequiredConfig(config: FirebaseAppConfig) {
  return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
}

function initializeWithConfig(config: FirebaseAppConfig) {
  if (_initialized || getApps().length > 0) {
    _initialized = true;
    _firestoreDatabaseId = config.firestoreDatabaseId;
    initializeAppCheckIfPossible();
    return true;
  }

  if (!hasRequiredConfig(config)) return false;

  initializeApp(config);
  _initialized = true;
  _firestoreDatabaseId = config.firestoreDatabaseId;
  initializeAppCheckIfPossible();
  return true;
}

function ensureInitialized() {
  if (_initialized || getApps().length > 0) {
    _initialized = true;
    initializeAppCheckIfPossible();
    return true;
  }

  return initializeWithConfig(getFirebaseConfig());
}

async function loadRuntimeConfig(options: { force?: boolean } = {}) {
  if (typeof window === 'undefined') return;

  if (!options.force && getRuntimeConfig()?.apiKey) return;

  _runtimeConfigPromise ??= (async () => {
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
  })().finally(() => {
    _runtimeConfigPromise = null;
  });

  await _runtimeConfigPromise;
}

async function ensureAppCheckConfigLoaded() {
  if (typeof window === 'undefined') return;

  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig?.appCheckRequired !== undefined) {
    if (!isAppCheckRequiredForClient() || getAppCheckSiteKey()) return;
  }

  await loadRuntimeConfig({ force: true });
}

export async function ensureFirebaseReady() {
  if (ensureInitialized()) {
    await ensureAppCheckConfigLoaded();
    initializeAppCheckIfPossible();
    return;
  }
  if (typeof window === 'undefined') return;

  _initPromise ??= (async () => {
    await loadRuntimeConfig();
    if (!ensureInitialized()) {
      throw new Error('Firebase app not initialized. Check NEXT_PUBLIC_FIREBASE_* env vars.');
    }
    await ensureAppCheckConfigLoaded();
    initializeAppCheckIfPossible();
  })().catch((error) => {
    _initPromise = null;
    throw error;
  });

  await _initPromise;
}

export function getFirebaseApp(): FirebaseApp {
  ensureInitialized();
  const app = getApps()[0];
  if (!app) {
    throw new Error('Firebase app not initialized. Call ensureFirebaseReady() before using Firebase.');
  }
  return app;
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

export function getFirebaseDb() {
  const app = getFirebaseApp();
  initializeAppCheckIfPossible();
  return _firestoreDatabaseId && _firestoreDatabaseId !== '(default)'
    ? getFirestore(app, _firestoreDatabaseId)
    : getFirestore(app);
}

function getAppCheckSiteKey() {
  return firstNonEmpty(
    process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY,
    getRuntimeConfig()?.appCheckSiteKey
  );
}

function initializeAppCheckIfPossible() {
  if (typeof window === 'undefined') return null;
  if (
    !shouldInitializeAppCheck(
      getRuntimeConfig()?.appCheckRequired,
      process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_REQUIRED
    )
  ) {
    return null;
  }
  const siteKey = getAppCheckSiteKey();
  if (!siteKey) return null;
  if (_appCheck) return _appCheck;

  const app = getApps()[0];
  if (!app) return null;

  try {
    _appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    if (!_appCheckInitWarningShown) {
      console.warn("[App Check] No se pudo inicializar App Check. Firestore o las APIs pueden rechazar solicitudes con enforcement activo.", error);
      _appCheckInitWarningShown = true;
            _appCheck = null;
    }
    return null;
  }

  return _appCheck;
}

export async function getAppCheckTokenForRequest(options: { forceRefresh?: boolean } = {}) {
  await ensureFirebaseReady();
  await ensureAppCheckConfigLoaded();
  if (!isAppCheckRequiredForClient()) return undefined;

  const appCheck = initializeAppCheckIfPossible();
  if (!appCheck) return undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await getToken(appCheck, options.forceRefresh || attempt > 0);
      return result.token;
    } catch (error) {
      if (attempt === 0) {
        await wait(350);
        continue;
      }

      if (!_appCheckTokenWarningShown) {
        console.warn("[App Check] Token no disponible; la solicitud puede ser rechazada si App Check esta en enforcement.", error);
        _appCheckTokenWarningShown = true;
      }
    }
  }

  return undefined;
}

function initializeFromStaticConfig() {
  if (getApps().length === 0) {
    ensureInitialized();
  }
}

initializeFromStaticConfig();

export const auth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_target, prop) {
    const authInstance = getFirebaseAuth();
    if (prop === '_delegate') return authInstance;
    return (authInstance as unknown as Record<string | symbol, unknown>)[prop];
  },
  getPrototypeOf() {
    return Object.getPrototypeOf(getFirebaseAuth());
  },
});

export const db = new Proxy({} as ReturnType<typeof getFirestore>, {
  get(_target, prop) {
    const firestore = getFirebaseDb();
    if (prop === '_delegate') return firestore;
    return (firestore as unknown as Record<string | symbol, unknown>)[prop];
  },
  getPrototypeOf() {
    return Object.getPrototypeOf(getFirebaseDb());
  },
});
