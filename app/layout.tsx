import type {Metadata} from 'next';
import './globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

import { AuthProvider, AuthGuard } from '@/components/auth-provider';
import { NavBar } from '@/components/navbar';
import { Toaster } from '@/components/ui/sonner';
import { AiChatPanel } from '@/components/ai-chat-panel';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'Control de EPP — Sistema de Gestión de Seguridad Industrial',
  description: 'Sistema inteligente de gestión de Equipo de Protección Personal con análisis predictivo por IA.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="es" className={cn("font-sans", geist.variable)}>
      <body suppressHydrationWarning className="min-h-screen bg-gray-50 text-gray-900">
        <AuthProvider>
          <AuthGuard>
            <NavBar />
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {children}
            </main>
            <AiChatPanel />
          </AuthGuard>
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
