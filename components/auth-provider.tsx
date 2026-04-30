"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { usePathname } from 'next/navigation';
import { ShieldCheck, LogIn } from 'lucide-react';

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
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600"></div>
        <p className="text-sm font-medium text-gray-500 animate-pulse">Cargando sistema...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-6">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl shadow-indigo-100/50 overflow-hidden border border-gray-100">
          <div className="bg-indigo-600 p-8 text-center text-white">
            <div className="inline-flex h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-md items-center justify-center mb-4">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Control de EPP</h1>
            <p className="text-indigo-100 mt-2">Acceso Administrativo</p>
          </div>
          <div className="p-8 text-center">
            <p className="text-gray-500 mb-8 leading-relaxed">
              Inicia sesión con tu cuenta corporativa para acceder a la gestión de inventario y personal.
            </p>
            <Button 
              onClick={signIn} 
              size="lg" 
              className="w-full h-14 rounded-xl bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 gap-3 text-base"
            >
              <LogIn className="h-5 w-5" />
              Continuar con Google
            </Button>
            
            <div className="mt-8 pt-6 border-t border-gray-50">
              <p className="text-xs text-gray-400 mb-3">¿Eres un colaborador y buscas tu historial?</p>
              <a 
                href="/portal" 
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors underline decoration-2 underline-offset-4"
              >
                Ir al Portal del Colaborador →
              </a>
            </div>
          </div>
        </div>
        <p className="mt-8 text-xs text-gray-400 font-medium tracking-widest uppercase">
          Seguridad Industrial • Panel de Control
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
