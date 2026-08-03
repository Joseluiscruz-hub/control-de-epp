"use client";

import { useEffect, useState } from "react";
import { getKioskServerSession } from "@/lib/kiosk-api";

export type KioskSessionSnapshot = {
  ready: boolean;
  employeeId: string;
  employeeName: string;
  employeePlant: string;
  pinVerified: boolean;
  requestId: string;
  selectedItemRaw: string;
  solicitudRaw: string;
  expiresAt: number;
};

const EMPTY_SNAPSHOT: KioskSessionSnapshot = {
  ready: false,
  employeeId: "",
  employeeName: "",
  employeePlant: "",
  pinVerified: false,
  requestId: "",
  selectedItemRaw: "",
  solicitudRaw: "",
  expiresAt: 0,
};

export function useKioskSessionSnapshot() {
  const [snapshot, setSnapshot] = useState<KioskSessionSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      const localSnapshot = {
        ready: true,
        employeeId: sessionStorage.getItem("kiosk_employee_id") ?? "",
        employeeName: sessionStorage.getItem("kiosk_employee_name") ?? "",
        employeePlant: sessionStorage.getItem("kiosk_employee_plant") ?? "",
        pinVerified: false,
        requestId: sessionStorage.getItem("kiosk_request_id") ?? "",
        selectedItemRaw: sessionStorage.getItem("kiosk_selected_item") ?? "",
        solicitudRaw: sessionStorage.getItem("kiosk_solicitud") ?? "",
        expiresAt: 0,
      };
      try {
        const serverSession = await getKioskServerSession();
        if (cancelled) return;
        setSnapshot(serverSession ? {
          ...localSnapshot,
          employeeId: serverSession.employeeId,
          employeeName: serverSession.employeeName,
          employeePlant: serverSession.plantId,
          pinVerified: true,
          expiresAt: serverSession.expiresAt,
        } : localSnapshot);
      } catch {
        if (!cancelled) setSnapshot(localSnapshot);
      }
    }, 0);

    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, []);

  return snapshot;
}

export function parseKioskSessionJson<T>(raw: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
