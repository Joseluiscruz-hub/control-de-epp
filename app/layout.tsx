import type {Metadata} from 'next';
import Script from 'next/script';
import './globals.css';
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

import { AuthProvider, AuthGuard } from '@/components/auth-provider';
import { NavBar } from '@/components/navbar';
import { Toaster } from '@/components/ui/sonner';
import { MouseTracker } from '@/components/mouse-tracker';
import { AppExtras, AppMain } from '@/components/app-extras';
import { PwaRegister } from '@/components/pwa-register';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://assetguard.local'),
  title: 'AssetGuard EPP — Control de Seguridad Industrial | ORSTED CORP',
  description: 'Plataforma corporativa de gestión de Equipo de Protección Personal con inteligencia artificial predictiva y monitoreo en tiempo real.',
  manifest: '/manifest.webmanifest',
  keywords: ['EPP', 'Seguridad Industrial', 'ORSTED CORP', 'AssetGuard', 'Control de Equipos', 'Protección Personal'],
  authors: [{ name: 'José Luis Cruz / ORSTED CORP demo' }],
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AssetGuard EPP',
  },
  openGraph: {
    title: 'AssetGuard EPP — ORSTED CORP',
    description: 'Plataforma corporativa de gestión de Equipo de Protección Personal',
    type: 'website',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es" className={cn("font-sans", inter.variable)}>
      <head>
        <Script src="/firebase-config.js" strategy="beforeInteractive" />
        <meta name="theme-color" content="#040813" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body suppressHydrationWarning className="min-h-screen mesh-bg text-foreground antialiased selection:bg-red-900/40 selection:text-red-200">
        <PwaRegister />
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
