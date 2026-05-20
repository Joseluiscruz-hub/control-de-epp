import type {Metadata} from 'next';
import './globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

import { AuthProvider, AuthGuard } from '@/components/auth-provider';
import { NavBar } from '@/components/navbar';
import { Toaster } from '@/components/ui/sonner';
import { AiChatPanel } from '@/components/ai-chat-panel';
import { MouseTracker } from '@/components/mouse-tracker';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'AssetGuard EPP — Control de Seguridad Industrial | Coca-Cola FEMSA',
  description: 'Plataforma corporativa de gestión de Equipo de Protección Personal con inteligencia artificial predictiva y monitoreo en tiempo real.',
  keywords: ['EPP', 'Seguridad Industrial', 'Coca-Cola FEMSA', 'AssetGuard', 'Control de Equipos', 'Protección Personal'],
  authors: [{ name: 'Coca-Cola FEMSA — Seguridad Industrial' }],
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    title: 'AssetGuard EPP — Coca-Cola FEMSA',
    description: 'Plataforma corporativa de gestión de Equipo de Protección Personal',
    type: 'website',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es" className={cn("font-sans", geist.variable)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="theme-color" content="#F40009" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body suppressHydrationWarning className="min-h-screen mesh-bg text-gray-900 antialiased selection:bg-red-100 selection:text-red-900">
        <AuthProvider>
          <AuthGuard>
            <MouseTracker />
            <NavBar />
            <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {children}
            </main>
            {/* FEMSA Corporate Footer */}
            <footer className="relative z-10 no-print mt-auto">
              <div className="femsa-divider mx-8" />
              <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-2">
                <span className="text-slate-400 text-[10px] uppercase tracking-[0.2em] font-bold">
                  AssetGuard Corporate v4.0
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: 'rgba(218,41,28,0.4)' }}>
                  Coca-Cola FEMSA · Impulsado por Gemini IA
                </span>
              </div>
            </footer>
            <AiChatPanel />
          </AuthGuard>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
