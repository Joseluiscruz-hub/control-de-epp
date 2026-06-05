"use client";

import { useEffect, useState } from "react";

export type KioskSessionSnapshot = {
  ready: boolean;
  employeeId: string;
  employeeName: string;
  employeePlant: string;
  pinVerified: boolean;
  requestId: string;
  selectedItemRaw: string;
  solicitudRaw: string;
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
};

export function useKioskSessionSnapshot() {
  const [snapshot, setSnapshot] = useState<KioskSessionSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSnapshot({
        ready: true,
        employeeId: sessionStorage.getItem("kiosk_employee_id") ?? "",
        employeeName: sessionStorage.getItem("kiosk_employee_name") ?? "",
        employeePlant: sessionStorage.getItem("kiosk_employee_plant") ?? "",
        pinVerified: sessionStorage.getItem("kiosk_pin_verified") === "true",
        requestId: sessionStorage.getItem("kiosk_request_id") ?? "",
        selectedItemRaw: sessionStorage.getItem("kiosk_selected_item") ?? "",
        solicitudRaw: sessionStorage.getItem("kiosk_solicitud") ?? "",
      });
    }, 0);

    return () => window.clearTimeout(timeout);
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
