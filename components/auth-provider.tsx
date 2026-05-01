"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';
import { ShieldCheck, LogIn, Fingerprint, Lock, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

// Lista de administradores (en un app real esto vendría de una base de datos o custom claims)
const ADMIN_EMAILS = [
  'admin@example.com',
  'joseluis@example.com', // Ejemplo
];

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  signIn: async () => {},
  logOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      // Check if user is admin
      if (u?.email) {
        // Para propósitos de esta demo, cualquier usuario logueado es admin si no restringimos
        // Pero podemos añadir lógica aquí para filtrar
        setIsAdmin(true); 
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logOut = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, signIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, signIn } = useAuth();
  const pathname = usePathname();

  // Permitir acceso total al portal público
  if (pathname?.startsWith('/portal')) {
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
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-6 relative overflow-hidden">
        {/* Background Effects - FEMSA Premium */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-femsa-red/20 via-transparent to-femsa-black/80" />
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-femsa-red/15 rounded-full blur-[120px]" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-femsa-red-dark/20 rounded-full blur-[120px]" />
          {/* Grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
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
              <div className="absolute inset-0 bg-red-600 rounded-3xl blur-2xl opacity-30" />
              <div className="relative h-24 w-24 rounded-3xl bg-[#F40009] flex items-center justify-center shadow-2xl shadow-red-500/40">
                <ShieldCheck className="h-12 w-12 text-white" />
              </div>
            </motion.div>
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase">AssetGuard</h1>
            <p className="text-red-500/80 font-black tracking-[0.3em] uppercase text-[10px] mt-2">Coca-Cola FEMSA • Seguridad Industrial</p>
          </div>

          {/* Login Card */}
          <div className="bg-white rounded-[3rem] shadow-2xl shadow-red-900/10 overflow-hidden">
            {/* FEMSA gradient stripe */}
            <div className="h-1.5 bg-gradient-to-r from-femsa-red via-coca-cola-red to-femsa-gold" />
            
            <div className="p-12 text-center space-y-8">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-50 rounded-full border border-slate-100">
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acceso Restringido</span>
                </div>
                <h2 className="text-3xl font-black text-slate-950 tracking-tight">Panel Administrativo</h2>
                <p className="text-slate-400 font-medium leading-relaxed max-w-sm mx-auto">
                  Inicia sesión con tu cuenta corporativa para acceder a la gestión de inventario y personal.
                </p>
              </div>

              <Button 
                onClick={signIn} 
                className="w-full h-20 rounded-[2rem] bg-slate-950 hover:bg-[#F40009] shadow-2xl shadow-slate-200 transition-all duration-500 text-white font-black uppercase tracking-widest text-xs gap-4 group active:scale-[0.98]"
              >
                <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                  <Fingerprint className="h-5 w-5" />
                </div>
                Continuar con Google
                <ArrowRight className="h-4 w-4 ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </Button>
              
              <div className="pt-6 border-t border-slate-100 space-y-3">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">¿Eres colaborador?</p>
                <a 
                  href="/portal" 
                  className="inline-flex items-center gap-2 text-sm font-black text-[#F40009] hover:text-red-700 transition-colors uppercase tracking-wider group"
                >
                  Ir al Portal de Seguridad
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </a>
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
          <p className="text-[9px] text-slate-600 uppercase tracking-[0.4em]">AssetGuard v4.0 · Seguridad Industrial</p>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
