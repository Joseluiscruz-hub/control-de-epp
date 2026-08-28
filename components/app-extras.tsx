"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AiChatPanel } from "@/components/ai-chat-panel";

export function AppMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicFlow = pathname === "/portal" || pathname?.startsWith("/kiosko");

  if (isPublicFlow) {
    return <main className="relative z-10 min-h-screen">{children}</main>;
  }

  return (
    <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {children}
    </main>
  );
}

export function AppExtras() {
  const pathname = usePathname();
  const isPublicFlow = pathname === "/portal" || pathname?.startsWith("/kiosko");

  if (isPublicFlow) return null;

  return (
    <>
      <footer className="relative z-10 no-print mt-auto">
        <div className="brand-divider mx-8" />
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span className="text-[rgba(248,250,252,0.3)] text-[10px] uppercase tracking-[0.2em] font-bold">
            AssetGuard Corporate v4.0
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: "rgba(244,0,9,0.4)" }}>
            ORSTED CORP · Impulsado por Gemini IA
          </span>
        </div>
      </footer>
      <AiChatPanel />
    </>
  );
}
