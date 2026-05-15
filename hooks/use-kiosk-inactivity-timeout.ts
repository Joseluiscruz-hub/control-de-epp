"use client";

import { useEffect } from "react";

interface UseKioskInactivityTimeoutOptions {
  timeoutMs: number;
  onTimeout: () => void;
}

export function useKioskInactivityTimeout({ timeoutMs, onTimeout }: UseKioskInactivityTimeoutOptions) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        onTimeout();
      }, timeoutMs);
    };

    const events = ["click", "touchstart", "keydown"];
    for (const event of events) {
      window.addEventListener(event, resetTimer, { passive: true });
    }

    resetTimer();

    return () => {
      if (timer) clearTimeout(timer);
      for (const event of events) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, [onTimeout, timeoutMs]);
}
