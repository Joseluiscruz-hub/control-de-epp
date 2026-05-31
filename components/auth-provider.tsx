"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, ensureFirebaseReady } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';
import { ShieldCheck, Fingerprint, Lock, ArrowRight, HardHat } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { canUseAdminProfile, isGlobalProfile, type AdminRole, type UserProfile } from '@/lib/admin-profile';
import { isPlantId, type PlantScope } from '@/lib/plants';

const ENABLE_OFFLINE_MODE = process.env.NEXT_PUBLIC_ENABLE_OFFLINE_MODE === 'true';
const ENABLE_BOOTSTRAP_ADMIN = process.env.NEXT_PUBLIC_ENABLE_BOOTSTRAP_ADMIN === 'true';
const BOOTSTRAP_ADMIN_EMAIL = (process.env.NEXT_PUBLIC_BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const OFFLINE_SESSION_KEY = 'assetguard.offline.adminSession';
const OFFLINE_ADMIN_USER = {
  uid: 'offline-admin',
  email: 'offline@assetguard.local',
  displayName: 'Admin Offline',
  photoURL: null,
} as User;

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isGlobalAdmin: boolean;
  isOfflineSession: boolean;
  signIn: () => Promise<void>;
  signInOffline: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isGlobalAdmin: false,
  isOfflineSession: false,
  signIn: async () => {},
  signInOffline: async () => {},
  logOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

function isConfiguredAdminEmail(email: string | null | undefined) {
  return ENABLE_BOOTSTRAP_ADMIN && !!email && !!BOOTSTRAP_ADMIN_EMAIL && email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;
}

function normalizeUserProfile(uid: string, fallbackEmail: string, data: Record<string, unknown>): UserProfile | null {
  const role = data.role === 'admin_local' || data.role === 'admin_global'
    ? data.role as AdminRole
    : null;
  if (!role) return null;

  const rawPlant = typeof data.plantaId === 'string' ? data.plantaId : '';
  const plantaId: PlantScope = role === 'admin_global'
    ? (rawPlant === 'nacional' || isPlantId(rawPlant) ? rawPlant : 'nacional')
    : isPlantId(rawPlant)
      ? rawPlant
      : 'cuautitlan';

  return {
    uid,
    email: typeof data.email === 'string' && data.email ? data.email.toLowerCase() : fallbackEmail,
    role,
    plantaId,
    displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
    active: data.active !== false,
  };
}

function fallbackAdminProfile(user: User): UserProfile | null {
  const email = user.email?.toLowerCase();
  if (!email || !isConfiguredAdminEmail(email)) return null;

  return {
    uid: user.uid,
    email,
    role: 'admin_global',
    plantaId: 'nacional',
    displayName: user.displayName ?? undefined,
    active: true,
  };
}

async function resolveUserProfile(user: User) {
  const fallback = fallbackAdminProfile(user);
  const email = user.email?.toLowerCase() ?? fallback?.email ?? '';

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      return normalizeUserProfile(user.uid, email, snap.data()) ?? fallback;
    }
  } catch (error) {
    console.warn('[Admin profile unavailable, using fallback permissions]', error);
  }

  return fallback;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);
  const [isOfflineSession, setIsOfflineSession] = useState(false);

  const startOfflineSession = () => {
    if (!ENABLE_OFFLINE_MODE) {
      window.localStorage.removeItem(OFFLINE_SESSION_KEY);
      toast.error('El modo offline admin esta deshabilitado en este ambiente.');
      return;
    }

    const offlineProfile: UserProfile = {
      uid: OFFLINE_ADMIN_USER.uid,
      email: OFFLINE_ADMIN_USER.email ?? 'offline@assetguard.local',
      role: 'admin_global',
      plantaId: 'nacional',
      displayName: OFFLINE_ADMIN_USER.displayName ?? 'Admin Offline',
      active: true,
    };
    window.localStorage.setItem(OFFLINE_SESSION_KEY, 'true');
    setUser(OFFLINE_ADMIN_USER);
    setProfile(offlineProfile);
    setIsAdmin(true);
    setIsGlobalAdmin(true);
    setIsOfflineSession(true);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let unavailableTimeout: number | undefined;

    if (!ENABLE_OFFLINE_MODE) {
      window.localStorage.removeItem(OFFLINE_SESSION_KEY);
    } else if (window.localStorage.getItem(OFFLINE_SESSION_KEY) === 'true') {
      if (navigator.onLine !== false) {
        window.localStorage.removeItem(OFFLINE_SESSION_KEY);
      } else {
        const timeout = window.setTimeout(() => {
          startOfflineSession();
        }, 0);
        return () => window.clearTimeout(timeout);
      }
    }

    const authTimeout = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 5000);

    const initializeAuthListener = async () => {
      try {
        await ensureFirebaseReady();
        if (cancelled) return;

        unsubscribe = onAuthStateChanged(auth, (u) => {
          window.clearTimeout(authTimeout);
          void (async () => {
            if (cancelled) return;
            setIsOfflineSession(false);
            setUser(u);

            if (!u) {
              setProfile(null);
              setIsAdmin(false);
              setIsGlobalAdmin(false);
              setLoading(false);
              return;
            }

            const resolvedProfile = await resolveUserProfile(u);
            if (cancelled) return;
            setProfile(resolvedProfile);
            setIsAdmin(canUseAdminProfile(resolvedProfile));
            setIsGlobalAdmin(isGlobalProfile(resolvedProfile));
            setLoading(false);
          })();
        }, (error) => {
          window.clearTimeout(authTimeout);
          console.error('[Auth state error]', error);
          setUser(null);
          setProfile(null);
          setIsAdmin(false);
          setIsGlobalAdmin(false);
          setIsOfflineSession(false);
          setLoading(false);
        });
      } catch (error) {
        window.clearTimeout(authTimeout);
        console.warn('[Auth unavailable, offline mode can be used]', error);
        unavailableTimeout = window.setTimeout(() => {
          if (cancelled) return;
          setUser(null);
          setProfile(null);
          setIsAdmin(false);
          setIsGlobalAdmin(false);
          setIsOfflineSession(false);
          setLoading(false);
        }, 0);
      }
    };

    void initializeAuthListener();

    return () => {
      cancelled = true;
      window.clearTimeout(authTimeout);
      if (unavailableTimeout) window.clearTimeout(unavailableTimeout);
      unsubscribe?.();
    };
  }, []);


  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    window.localStorage.removeItem(OFFLINE_SESSION_KEY);
    setIsOfflineSession(false);
    try {
      await ensureFirebaseReady();
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (ENABLE_OFFLINE_MODE && typeof navigator !== 'undefined' && navigator.onLine === false) {
        startOfflineSession();
        return;
      }
      throw error;
    }
  };

  const signInOffline = async () => {
    if (!ENABLE_OFFLINE_MODE) {
      toast.error('El modo offline admin esta deshabilitado en este ambiente.');
      return;
    }
    startOfflineSession();
  };

  const logOut = async () => {
    window.localStorage.removeItem(OFFLINE_SESSION_KEY);
    if (isOfflineSession || user?.uid === OFFLINE_ADMIN_USER.uid) {
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
      setIsGlobalAdmin(false);
      setIsOfflineSession(false);
      return;
    }

    try {
      await ensureFirebaseReady();
      await signOut(auth);
    } catch (error) {
      console.warn('[Sign out skipped because Firebase auth is unavailable]', error);
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
      setIsGlobalAdmin(false);
      setIsOfflineSession(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, isGlobalAdmin, isOfflineSession, signIn, signInOffline, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, signIn, signInOffline, isAdmin, logOut } = useAuth();
  const pathname = usePathname();

  const handleOnlineSignIn = async () => {
    try {
      await signIn();
    } catch (error) {
      console.error('[Online sign in error]', error);
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: string }).code
          : '';

      if (code === 'auth/popup-blocked') {
        toast.error('El navegador bloqueó la ventana de Google. Permite popups para iniciar sesión.');
      } else if (code === 'auth/unauthorized-domain') {
        toast.error('Este dominio no está autorizado en Firebase Auth.');
      } else {
        toast.error('No se pudo iniciar sesión en modo online. Intenta de nuevo.');
      }
    }
  };

  // Permitir acceso total al portal público y kiosko
  if (pathname?.startsWith('/portal') || pathname?.startsWith('/kiosko')) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 gap-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          <div className="absolute inset-0 bg-red-600 rounded-3xl blur-xl opacity-30 animate-pulse" />
          <div className="relative h-20 w-20 rounded-3xl bg-[#F40009] flex items-center justify-center shadow-2xl shadow-red-500/30">
            <ShieldCheck className="h-10 w-10 text-white" />
          </div>
        </motion.div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 bg-red-500 rounded-full animate-bounce [animation-delay:0ms]" />
          <div className="h-2 w-2 bg-red-500 rounded-full animate-bounce [animation-delay:150ms]" />
          <div className="h-2 w-2 bg-red-500 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Inicializando Sistemas de Seguridad</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#07090d] p-6 relative overflow-hidden">
        {/* Executive background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(244,0,9,0.16),transparent_36%,rgba(212,160,23,0.06))]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full max-w-lg"
        >
          {/* Logo Section */}
          <div className="text-center mb-12">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
              className="inline-flex relative mb-6"
            >
              <div className="relative h-20 w-20 rounded-xl bg-[#F40009] flex items-center justify-center shadow-2xl shadow-red-950/40">
                <ShieldCheck className="h-12 w-12 text-white" />
              </div>
            </motion.div>
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase">AssetGuard</h1>
            <p className="text-red-500/80 font-black tracking-[0.3em] uppercase text-[10px] mt-2">Coca-Cola FEMSA • Seguridad Industrial</p>
          </div>

          {/* Login Card */}
          <div className="enterprise-panel">
            {/* FEMSA gradient stripe */}
            <div className="h-1.5 bg-gradient-to-r from-femsa-red via-coca-cola-red to-femsa-gold" />
            
            <div className="p-10 text-center space-y-8">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg border border-white/10 bg-white/5">
                  <Lock className="h-3.5 w-3.5 text-white/45" />
                  <span className="section-eyebrow">Acceso Restringido</span>
                </div>
                <h2 className="text-3xl font-black text-white tracking-tight">Panel Administrativo</h2>
                <p className="text-white/50 font-medium leading-relaxed max-w-sm mx-auto">
                  Inicia sesión con tu cuenta corporativa para acceder a la gestión de inventario y personal.
                </p>
              </div>

              <Button 
                onClick={() => void handleOnlineSignIn()} 
                className="w-full h-16 rounded-lg bg-[#F40009] hover:bg-red-700 shadow-xl shadow-red-950/30 transition-all duration-300 text-white font-black uppercase tracking-widest text-xs gap-4 group active:scale-[0.98]"
              >
                <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                  <Fingerprint className="h-5 w-5" />
                </div>
                Continuar con Google
                <ArrowRight className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </Button>
              {ENABLE_OFFLINE_MODE && (
                <Button
                  type="button"
                  onClick={signInOffline}
                  className="w-full h-14 rounded-lg border border-amber-300/25 bg-amber-500/10 hover:bg-amber-500/15 text-amber-200 font-black uppercase tracking-widest text-xs gap-3"
                >
                  <HardHat className="h-4 w-4" />
                  Entrar en modo offline
                </Button>
              )}
              
              <div className="pt-6 border-t border-white/10 space-y-3">
                <p className="section-eyebrow">¿Eres colaborador?</p>
                <div className="flex flex-col gap-3">
                  <a
                    href="/portal"
                    className="inline-flex items-center justify-center gap-2 text-sm font-black text-[#F40009] hover:text-red-300 transition-colors uppercase tracking-wider group"
                  >
                    Ir al Portal de Seguridad
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </a>
                  <a
                    href="/kiosko"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-3 text-xs font-black text-white/70 hover:border-amber-300/40 hover:bg-amber-500/10 hover:text-amber-300 transition-colors uppercase tracking-wider group"
                  >
                    <HardHat className="h-4 w-4" />
                    Solicitar EPP en Kiosko
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="relative z-10 mt-12 text-center space-y-4"
        >
          <div className="flex items-center justify-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Sistemas Operativos</span>
          </div>
          {/* Badge FEMSA */}
          <div className="badge-femsa inline-block">
            Coca-Cola FEMSA · Plataforma Corporativa Oficial
          </div>
          <p className="text-[9px] text-white/25 uppercase tracking-[0.4em]">AssetGuard v4.0 · Seguridad Industrial</p>
        </motion.div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#07090d] p-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(244,0,9,0.16),transparent_36%,rgba(212,160,23,0.06))]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="relative z-10 w-full max-w-lg enterprise-panel p-10 text-center space-y-8"
        >
          <div className="mx-auto h-16 w-16 rounded-xl bg-[#F40009]/20 border border-[#F40009]/30 flex items-center justify-center">
            <Lock className="h-8 w-8 text-[#F40009]" />
          </div>
          <div className="space-y-3">
            <p className="section-eyebrow">Acceso Administrativo</p>
            <h1 className="text-3xl font-black text-white tracking-tight">Cuenta no autorizada</h1>
            <p className="text-white/50 font-medium leading-relaxed">
              {user.email} no tiene un perfil administrativo activo en AssetGuard.
            </p>
          </div>
          <Button
            onClick={logOut}
            className="w-full h-14 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black uppercase tracking-widest text-xs"
          >
            Cambiar cuenta
          </Button>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
