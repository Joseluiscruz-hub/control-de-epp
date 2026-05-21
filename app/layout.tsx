import type {Metadata} from 'next';
import './globals.css';
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

import { AuthProvider, AuthGuard } from '@/components/auth-provider';
import { NavBar } from '@/components/navbar';
import { Toaster } from '@/components/ui/sonner';
import { MouseTracker } from '@/components/mouse-tracker';
import { AppExtras, AppMain } from '@/components/app-extras';

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
        <AuthProvider>
          <AuthGuard>
            <MouseTracker />
            <NavBar />
            <AppMain>
              {children}
            </AppMain>
            <AppExtras />
          </AuthGuard>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
