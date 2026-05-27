"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';
import { ShieldCheck, Fingerprint, Lock, ArrowRight, HardHat } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';

// Lista de administradores — configurable por variable de entorno
// En GitHub Variables → ADMIN_EMAILS (separados por comas)
// En .env.local → NEXT_PUBLIC_ADMIN_EMAILS=email1@gmail.com,email2@gmail.com
const ADMIN_EMAILS: string[] = (() => {
  const envEmails = process.env.NEXT_PUBLIC_ADMIN_EMAILS;
  if (envEmails) {
    return envEmails.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  }
  // Fallback para desarrollo local — REEMPLAZA con tu(s) email(s) real(es)
  return [
    'mimonkb222@gmail.com',
    'malvamora23@gmail.com',
  ];
})();

const OFFLINE_SESSION_KEY = 'assetguard.offline.adminSession';
const OFFLINE_ADMIN_USER = {
  uid: 'offline-admin',
  email: 'offline@assetguard.local',
  displayName: 'Admin Offline',
  photoURL: null,
} as User;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isOfflineSession: boolean;
  signIn: () => Promise<void>;
  signInOffline: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  isOfflineSession: false,
  signIn: async () => {},
  signInOffline: async () => {},
  logOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOfflineSession, setIsOfflineSession] = useState(false);

  const startOfflineSession = () => {
    window.localStorage.setItem(OFFLINE_SESSION_KEY, 'true');
    setUser(OFFLINE_ADMIN_USER);
    setIsAdmin(true);
    setIsOfflineSession(true);
    setLoading(false);
  };

  useEffect(() => {
    if (window.localStorage.getItem(OFFLINE_SESSION_KEY) === 'true') {
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
      setLoading(false);
    }, 5000);

    try {
      const unsubscribe = onAuthStateChanged(auth, (u) => {
        window.clearTimeout(authTimeout);
        setIsOfflineSession(false);
        setUser(u);
        // Validar admin contra la lista de emails autorizados
        if (u?.email) {
          const userEmail = u.email.toLowerCase();
          setIsAdmin(ADMIN_EMAILS.includes(userEmail));
        } else {
          setIsAdmin(false);
        }
        setLoading(false);
      }, (error) => {
        window.clearTimeout(authTimeout);
        console.error('[Auth state error]', error);
        setUser(null);
        setIsAdmin(false);
        setIsOfflineSession(false);
        setLoading(false);
      });
      return () => {
        window.clearTimeout(authTimeout);
        unsubscribe();
      };
    } catch (error) {
      window.clearTimeout(authTimeout);
      console.warn('[Auth unavailable, offline mode can be used]', error);
      const timeout = window.setTimeout(() => {
        setUser(null);
        setIsAdmin(false);
        setIsOfflineSession(false);
        setLoading(false);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, []);


  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    window.localStorage.removeItem(OFFLINE_SESSION_KEY);
    setIsOfflineSession(false);
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        startOfflineSession();
        return;
      }
      throw error;
    }
  };

  const signInOffline = async () => {
    startOfflineSession();
  };

  const logOut = async () => {
    window.localStorage.removeItem(OFFLINE_SESSION_KEY);
    if (isOfflineSession || user?.uid === OFFLINE_ADMIN_USER.uid) {
      setUser(null);
      setIsAdmin(false);
      setIsOfflineSession(false);
      return;
    }

    try {
      await signOut(auth);
    } catch (error) {
      console.warn('[Sign out skipped because Firebase auth is unavailable]', error);
      setUser(null);
      setIsAdmin(false);
      setIsOfflineSession(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, isOfflineSession, signIn, signInOffline, logOut }}>
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
              <Button
                type="button"
                onClick={signInOffline}
                className="w-full h-14 rounded-lg border border-amber-300/25 bg-amber-500/10 hover:bg-amber-500/15 text-amber-200 font-black uppercase tracking-widest text-xs gap-3"
              >
                <HardHat className="h-4 w-4" />
                Entrar en modo offline
              </Button>
              
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
              {user.email} no está en la lista de administradores globales de AssetGuard.
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
