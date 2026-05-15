"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { getKioskRequestStatus } from "@/lib/kiosk-api";
import { clearKioskSession } from "@/lib/kiosk-session";
import { useKioskInactivityTimeout } from "@/hooks/use-kiosk-inactivity-timeout";

type ViewStatus = "pending" | "approved" | "rejected" | "not_found";

export default function KioskoEsperaPage() {
  const router = useRouter();
  const [status, setStatus] = useState<ViewStatus>("pending");
  const [loading, setLoading] = useState(true);

  const returnToLogin = useCallback(() => {
    clearKioskSession();
    router.replace("/kiosko");
  }, [router]);

  useKioskInactivityTimeout({
    timeoutMs: 2 * 60 * 1000,
    onTimeout: returnToLogin,
  });

  useEffect(() => {
    const requestId = sessionStorage.getItem("kiosk_request_id");
    const verified = sessionStorage.getItem("kiosk_pin_verified");
    if (!requestId || verified !== "true") {
      returnToLogin();
      return;
    }

    let active = true;
    const poll = async () => {
      try {
        const next = await getKioskRequestStatus(requestId);
        if (!active) return;
        setStatus(next);
      } finally {
        if (active) setLoading(false);
      }
    };

    poll();
    const interval = window.setInterval(poll, 12000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [returnToLogin]);

  useEffect(() => {
    if (status === "pending") return;
    const t = window.setTimeout(() => {
      returnToLogin();
    }, 6000);

    return () => window.clearTimeout(t);
  }, [status, returnToLogin]);

  const content = useMemo(() => {
    if (loading || status === "pending") {
      return {
        icon: <Loader2 className="animate-spin text-amber-400" size={56} />,
        title: "Solicitud enviada",
        body: "Estamos notificando al administrador para gestionar tu solicitud.",
        badge: <Clock3 size={16} />,
        badgeText: "En espera de aprobación",
        badgeClass: "bg-amber-900/30 text-amber-300 border-amber-500/30",
      };
    }

    if (status === "approved") {
      return {
        icon: <CheckCircle2 className="text-green-400" size={56} />,
        title: "Solicitud aprobada",
        body: "Tu solicitud fue gestionada correctamente. Regresaremos al inicio.",
        badge: <CheckCircle2 size={16} />,
        badgeText: "Aprobada",
        badgeClass: "bg-green-900/30 text-green-300 border-green-500/30",
      };
    }

    return {
      icon: <XCircle className="text-red-400" size={56} />,
      title: status === "not_found" ? "Solicitud no encontrada" : "Solicitud rechazada",
      body:
        status === "not_found"
          ? "No encontramos esta solicitud. Regresaremos al inicio por seguridad."
          : "Tu solicitud no pudo ser aprobada. Contacta a tu supervisor.",
      badge: <XCircle size={16} />,
      badgeText: status === "not_found" ? "No encontrada" : "Rechazada",
      badgeClass: "bg-red-900/30 text-red-300 border-red-500/30",
    };
  }, [loading, status]);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-xl rounded-3xl border border-gray-800 bg-gray-900 p-8 md:p-10 text-center">
        <div className="flex justify-center mb-6">{content.icon}</div>
        <h2 className="text-3xl font-bold mb-3">{content.title}</h2>
        <p className="text-gray-400 text-lg leading-relaxed">{content.body}</p>

        <div
          className={`mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold ${content.badgeClass}`}
        >
          {content.badge}
          {content.badgeText}
        </div>

        <div className="mt-8">
          <button
            onClick={returnToLogin}
            className="px-6 py-3 rounded-xl border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  );
}
