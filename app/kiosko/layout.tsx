import type { Metadata } from "next";
import "../../app/globals.css";

export const metadata: Metadata = {
  title: "Kiosko EPP — Solicitud de Equipo de Protección Personal",
  description: "Sistema de autoservicio para solicitud de EPP.",
};

// Este layout NO incluye AuthGuard ni NavBar del admin.
// El kiosko tiene su propio flujo de autenticación por PIN de empleado.
export default function KioskoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="kiosko-root min-h-screen bg-gray-900 text-white flex flex-col select-none">
      {/* Header mínimo */}
      <header className="flex items-center gap-3 px-8 py-5 border-b border-gray-700/60">
        <div className="flex items-center gap-2">
          {/* Logo inline SVG */}
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-label="EPP Logo">
            <rect width="36" height="36" rx="8" fill="#f59e0b"/>
            <path d="M18 7C13.03 7 9 11.03 9 16c0 3.31 1.76 6.21 4.39 7.84V25a1 1 0 001 1h7.22a1 1 0 001-1v-1.16A8.97 8.97 0 0027 16c0-4.97-4.03-9-9-9z" fill="#1c1917"/>
            <rect x="14" y="26" width="8" height="2" rx="1" fill="#1c1917"/>
            <rect x="15" y="29" width="6" height="1.5" rx="0.75" fill="#1c1917"/>
          </svg>
          <span className="font-bold text-xl tracking-tight text-white">Kiosko <span className="text-amber-400">EPP</span></span>
        </div>
        <div className="ml-auto text-sm text-gray-400" id="kiosko-clock" suppressHydrationWarning />
      </header>
      <main className="flex-1 flex flex-col">
        {children}
      </main>
      {/* Clock script */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          function tick() {
            var el = document.getElementById("kiosko-clock");
            if (el) el.textContent = new Date().toLocaleTimeString("es-MX", {hour:"2-digit",minute:"2-digit",second:"2-digit"});
          }
          tick();
          setInterval(tick, 1000);
        })();
      `}} />
    </div>
  );
}
