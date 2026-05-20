import type {Metadata} from 'next';
import './globals.css';
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

import { AuthProvider, AuthGuard } from '@/components/auth-provider';
import { NavBar } from '@/components/navbar';
import { Toaster } from '@/components/ui/sonner';
import { AiChatPanel } from '@/components/ai-chat-panel';
import { MouseTracker } from '@/components/mouse-tracker';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

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
    <html lang="es" className={cn("font-sans", inter.variable)}>
      <head>
        <meta name="theme-color" content="#040813" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body suppressHydrationWarning className="min-h-screen mesh-bg text-foreground antialiased selection:bg-red-900/40 selection:text-red-200">
        {/* Aurora animated background lights */}
        <div className="aurora-1" aria-hidden="true" />
        <div className="aurora-2" aria-hidden="true" />

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
                <span className="text-[rgba(248,250,252,0.3)] text-[10px] uppercase tracking-[0.2em] font-bold">
                  AssetGuard Corporate v4.0
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: 'rgba(244,0,9,0.4)' }}>
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
