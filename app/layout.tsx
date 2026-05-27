import type {Metadata} from 'next';
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

function getRuntimeFirebaseConfig() {
  const measurementId =
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ||
    process.env.FIREBASE_MEASUREMENT_ID ||
    "";

  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "",
    storageBucket:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
      process.env.FIREBASE_STORAGE_BUCKET ||
      "",
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
      process.env.FIREBASE_MESSAGING_SENDER_ID ||
      "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "",
    ...(measurementId ? { measurementId } : {}),
    firestoreDatabaseId:
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ||
      process.env.FIREBASE_DATABASE_ID ||
      "(default)",
  };
}

export const metadata: Metadata = {
  metadataBase: new URL('https://assetguard.local'),
  title: 'AssetGuard EPP — Control de Seguridad Industrial | Coca-Cola FEMSA',
  description: 'Plataforma corporativa de gestión de Equipo de Protección Personal con inteligencia artificial predictiva y monitoreo en tiempo real.',
  manifest: '/manifest.webmanifest',
  keywords: ['EPP', 'Seguridad Industrial', 'Coca-Cola FEMSA', 'AssetGuard', 'Control de Equipos', 'Protección Personal'],
  authors: [{ name: 'Coca-Cola FEMSA — Seguridad Industrial' }],
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
    title: 'AssetGuard EPP — Coca-Cola FEMSA',
    description: 'Plataforma corporativa de gestión de Equipo de Protección Personal',
    type: 'website',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  const runtimeFirebaseConfig = getRuntimeFirebaseConfig();

  return (
    <html lang="es" className={cn("font-sans", inter.variable)}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__ASSETGUARD_FIREBASE_CONFIG__=${JSON.stringify(runtimeFirebaseConfig).replace(/</g, "\\u003c")};`,
          }}
        />
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
