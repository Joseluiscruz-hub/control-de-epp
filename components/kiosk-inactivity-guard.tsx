"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Clock3 } from "lucide-react";
import { clearKioskSession, isKioskSessionBusy } from "@/lib/kiosk-session";

const TIMEOUT_MS = 2 * 60 * 1000;
const WARNING_MS = 15 * 1000;
const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

type TimerId = number | null;

export function KioskInactivityGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_MS / 1000);
  const warningOpenRef = useRef(false);
  const resetTimersRef = useRef<() => void>(() => undefined);
  const timersRef = useRef<{
    warning: TimerId;
    logout: TimerId;
    countdown: TimerId;
  }>({
    warning: null,
    logout: null,
    countdown: null,
  });

  const clearTimers = useCallback(() => {
    const timers = timersRef.current;
    if (timers.warning) window.clearTimeout(timers.warning);
    if (timers.logout) window.clearTimeout(timers.logout);
    if (timers.countdown) window.clearInterval(timers.countdown);
    timers.warning = null;
    timers.logout = null;
    timers.countdown = null;
  }, []);

  const hasActiveSession = useCallback(() => {
    if (typeof window === "undefined") return false;
    if (pathname !== "/kiosko") return true;
    return Boolean(
      sessionStorage.getItem("kiosk_employee_id") ||
        sessionStorage.getItem("kiosk_pin_verified") === "true" ||
        sessionStorage.getItem("kiosk_request_id")
    );
  }, [pathname]);

  const closeWarning = useCallback(() => {
    warningOpenRef.current = false;
    setWarningOpen(false);
    setSecondsLeft(WARNING_MS / 1000);
  }, []);

  const timeoutSession = useCallback(() => {
    if (isKioskSessionBusy()) {
      resetTimersRef.current();
      return;
    }

    clearTimers();
    closeWarning();
    clearKioskSession();
    router.replace("/kiosko");
  }, [clearTimers, closeWarning, router]);

  const startWarning = useCallback(() => {
    if (!hasActiveSession()) return;
    if (isKioskSessionBusy()) {
      resetTimersRef.current();
      return;
    }

    clearTimers();
    warningOpenRef.current = true;
    setWarningOpen(true);
    setSecondsLeft(WARNING_MS / 1000);

    const deadline = Date.now() + WARNING_MS;
    timersRef.current.countdown = window.setInterval(() => {
      setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 250);
    timersRef.current.logout = window.setTimeout(timeoutSession, WARNING_MS);
  }, [clearTimers, hasActiveSession, timeoutSession]);

  const resetTimers = useCallback(() => {
    clearTimers();
    closeWarning();
    if (!hasActiveSession()) return;
    timersRef.current.warning = window.setTimeout(startWarning, TIMEOUT_MS - WARNING_MS);
  }, [clearTimers, closeWarning, hasActiveSession, startWarning]);

  useEffect(() => {
    resetTimersRef.current = resetTimers;
  }, [resetTimers]);

  useEffect(() => {
    const setupTimer = window.setTimeout(resetTimers, 0);

    const handleActivity = () => {
      if (warningOpenRef.current) return;
      resetTimersRef.current();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    return () => {
      window.clearTimeout(setupTimer);
      clearTimers();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
    };
  }, [clearTimers, pathname, resetTimers]);

  const extendSession = () => {
    resetTimersRef.current();
  };

  const logoutNow = () => {
    if (isKioskSessionBusy()) {
      resetTimersRef.current();
      return;
    }
    clearTimers();
    closeWarning();
    clearKioskSession();
    router.replace("/kiosko");
  };

  return (
    <>
      {children}
      {warningOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-amber-400/35 bg-[#07090d] p-6 text-center shadow-2xl shadow-black/50">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-400/10 text-amber-300">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-2xl font-black uppercase tracking-tight text-white">Sesion por cerrar</h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-white/60">
              No detectamos actividad. La sesion del kiosko se cerrara automaticamente.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-3 text-lg font-black text-amber-300">
              <Clock3 className="h-5 w-5" />
              {secondsLeft}s
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={logoutNow}
                className="rounded-lg border border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white/55 transition-colors hover:bg-white/10 hover:text-white"
              >
                Cerrar ahora
              </button>
              <button
                type="button"
                onClick={extendSession}
                className="rounded-lg bg-amber-400 px-4 py-3 text-sm font-black uppercase tracking-wide text-gray-950 transition-colors hover:bg-amber-300"
              >
                Continuar sesion
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
