"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { getKioskRequestStatus, logoutKioskServerSession } from "@/lib/kiosk-api";
import { clearKioskSession } from "@/lib/kiosk-session";
import { useKioskSessionSnapshot } from "../use-kiosk-session-snapshot";

type ViewStatus = "pending" | "approved" | "rejected";
// Balancea refresco percibido por usuario y carga de lecturas en Firestore.
const POLL_INTERVAL_MS = 12_000;
const AUTO_RETURN_DELAY_MS = 6_000;

export default function KioskoEsperaPage() {
  const router = useRouter();
  const { ready, pinVerified, requestId } = useKioskSessionSnapshot();
  const [status, setStatus] = useState<ViewStatus>("pending");
  const [notFound, setNotFound] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [loading, setLoading] = useState(true);

  const returnToLogin = useCallback(() => {
    void logoutKioskServerSession();
    clearKioskSession();
    router.replace("/kiosko");
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    if (!requestId || !pinVerified) {
      returnToLogin();
      return;
    }

    let active = true;
    const poll = async () => {
      try {
        const next = await getKioskRequestStatus(requestId);
        if (!active) return;
        setNotFound(false);
        setConnectionError(false);
        setStatus(next);
      } catch (error) {
        if (!active) return;
        const errorStatus = typeof error === "object" && error !== null && "status" in error
          ? Number((error as { status?: unknown }).status)
          : 0;
        if (errorStatus === 401 || errorStatus === 403) {
          returnToLogin();
          return;
        }
        const isNotFound = error instanceof Error && error.message === "kiosk_request_not_found";
        setNotFound(isNotFound);
        setConnectionError(!isNotFound);
        if (isNotFound) {
          setStatus("rejected");
        } else {
          setStatus("pending");
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    poll();
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [pinVerified, ready, requestId, returnToLogin]);

  useEffect(() => {
    if (status === "pending" || connectionError) return;
    const t = window.setTimeout(() => {
      returnToLogin();
    }, AUTO_RETURN_DELAY_MS);

    return () => window.clearTimeout(t);
  }, [status, connectionError, returnToLogin]);

  const content = useMemo(() => {
    if (connectionError) {
      return {
        icon: <Clock3 className="text-amber-400" size={56} />,
        title: "Seguimos validando tu solicitud",
        body: "Hay un problema temporal de conexión. Mantén esta pantalla abierta mientras reintentamos.",
        badge: <Clock3 size={16} />,
        badgeText: "Reintentando conexión",
        badgeClass: "bg-amber-900/30 text-amber-300 border-amber-500/30",
      };
    }

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
      title: notFound ? "Solicitud no encontrada" : "Solicitud rechazada",
      body:
        notFound
          ? "No encontramos esta solicitud. Regresaremos al inicio por seguridad."
          : "Tu solicitud no pudo ser aprobada. Contacta a tu supervisor.",
      badge: <XCircle size={16} />,
      badgeText: notFound ? "No encontrada" : "Rechazada",
      badgeClass: "bg-red-900/30 text-red-300 border-red-500/30",
    };
  }, [loading, status, notFound, connectionError]);

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
