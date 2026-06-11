"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-context";
import { DEFAULT_PLANT_ID, isPlantId, plantLabel, type ActivePlantId } from "@/lib/plants";
import { usePlantStore } from "@/store/usePlantStore";

type LiveDoc = { id: string; data: Record<string, unknown> };

type LiveMonitoringPayload = {
  activePlantId?: ActivePlantId;
  requests?: LiveDoc[];
  assignments?: LiveDoc[];
  inventory?: LiveDoc[];
  alerts?: LiveDoc[];
  error?: string;
};

export interface LiveActivity {
  id: string;
  plantaId: string;
  employeeId: string;
  employeeName: string;
  employeeArea: string;
  itemLabel: string;
  status: string;
  createdAt: Date;
  hasEarlyReplacementAlert: boolean;
}

export interface LivePlantSummary {
  plantaId: string;
  label: string;
  requests: number;
  consumptions: number;
  alerts: number;
  lowStock: number;
}

export interface LiveDashboardState {
  loading: boolean;
  error: string | null;
  activePlantId: ActivePlantId;
  recentActivity: LiveActivity[];
  plantSummaries: LivePlantSummary[];
  pendingRequests: number;
  todayConsumptions: number;
  openAlerts: number;
  criticalAlerts: number;
  lowStockItems: number;
  totalStock: number;
}

const LOW_STOCK_THRESHOLD = 20;
const RECENT_WINDOW_DAYS = 30;
const REFRESH_INTERVAL_MS = 15_000;

function toDate(value: unknown) {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate() as Date;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(0);
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function docPlant(data: Record<string, unknown>) {
  return text(data.plantaId, DEFAULT_PLANT_ID);
}

function isToday(date: Date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function isWithinLastDays(date: Date, days: number) {
  if (date.getTime() === 0) return false;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - days);
  threshold.setHours(0, 0, 0, 0);
  return date >= threshold;
}

function normalizeDocs(input: unknown): LiveDoc[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((doc): LiveDoc | null => {
      if (!doc || typeof doc !== "object") return null;
      const candidate = doc as Record<string, unknown>;
      if (typeof candidate.id !== "string") return null;
      const data = candidate.data;
      return {
        id: candidate.id,
        data: data && typeof data === "object" && !Array.isArray(data)
          ? data as Record<string, unknown>
          : {},
      };
    })
    .filter((doc): doc is LiveDoc => doc !== null);
}

function requestToActivity(doc: LiveDoc): LiveActivity {
  const items = Array.isArray(doc.data.items) ? doc.data.items as Array<Record<string, unknown>> : [];
  const itemLabel = items
    .slice(0, 2)
    .map((item) => text(item.itemName, text(item.sku, "EPP")))
    .join(", ");

  return {
    id: doc.id,
    plantaId: docPlant(doc.data),
    employeeId: text(doc.data.employeeId),
    employeeName: text(doc.data.employeeName, "Colaborador"),
    employeeArea: text(doc.data.employeeArea, "SIN AREA"),
    itemLabel: itemLabel || "EPP",
    status: text(doc.data.status, "pending"),
    createdAt: toDate(doc.data.createdAt),
    hasEarlyReplacementAlert: doc.data.hasEarlyReplacementAlert === true,
  };
}

function readStock(data: Record<string, unknown>) {
  if (typeof data.stock === "number") return Math.max(0, data.stock);
  const sizes = data.sizes;
  if (!sizes || typeof sizes !== "object" || Array.isArray(sizes)) return 0;
  return Object.values(sizes as Record<string, Record<string, unknown>>).reduce(
    (sum, variant) => sum + number(variant.stock),
    0
  );
}

export function useLiveDashboard(): LiveDashboardState {
  const { activePlantId } = usePlantStore();
  const { user, profile, isGlobalAdmin, loading: authLoading, isOfflineSession } = useAuth();
  const [requests, setRequests] = useState<LiveDoc[]>([]);
  const [assignments, setAssignments] = useState<LiveDoc[]>([]);
  const [inventory, setInventory] = useState<LiveDoc[]>([]);
  const [alerts, setAlerts] = useState<LiveDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scopedPlantId: ActivePlantId = useMemo(() => (
    isGlobalAdmin
      ? activePlantId
      : isPlantId(profile?.plantaId)
        ? profile.plantaId
        : DEFAULT_PLANT_ID
  ), [activePlantId, isGlobalAdmin, profile]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;

    if (authLoading) {
      return () => {
        cancelled = true;
      };
    }

    if (!profile || !user || isOfflineSession) {
      const timeout = window.setTimeout(() => {
        if (cancelled) return;
        setRequests([]);
        setAssignments([]);
        setInventory([]);
        setAlerts([]);
        setError(isOfflineSession
          ? "La torre de control requiere sesion online para sincronizar Firebase."
          : "Sesion administrativa requerida.");
        setLoading(false);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }

    const syncDashboard = async (initialLoad: boolean) => {
      try {
        if (initialLoad) setLoading(true);

        const token = await user.getIdToken();
        const response = await fetch(`/api/monitoring/live?plant=${encodeURIComponent(scopedPlantId)}`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
        const payload = await response.json().catch(() => ({})) as LiveMonitoringPayload;

        if (!response.ok) {
          throw new Error(typeof payload.error === "string" ? payload.error : "live_monitoring_sync_failed");
        }
        if (cancelled) return;

        setRequests(normalizeDocs(payload.requests)
          .filter((doc) => isWithinLastDays(toDate(doc.data.createdAt), RECENT_WINDOW_DAYS))
          .sort((a, b) => toDate(b.data.createdAt).getTime() - toDate(a.data.createdAt).getTime())
          .slice(0, 200));
        setAssignments(normalizeDocs(payload.assignments)
          .filter((doc) => isWithinLastDays(toDate(doc.data.assignedAt), RECENT_WINDOW_DAYS))
          .sort((a, b) => toDate(b.data.assignedAt).getTime() - toDate(a.data.assignedAt).getTime())
          .slice(0, 500));
        setInventory(normalizeDocs(payload.inventory));
        setAlerts(normalizeDocs(payload.alerts)
          .filter((doc) => isWithinLastDays(toDate(doc.data.createdAt), RECENT_WINDOW_DAYS))
          .sort((a, b) => toDate(b.data.createdAt).getTime() - toDate(a.data.createdAt).getTime())
          .slice(0, 100));
        setError(null);
      } catch (syncError) {
        if (cancelled) return;
        console.error("[Live dashboard API sync error]", syncError);
        setError("No se pudo sincronizar la torre de control en vivo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void syncDashboard(true);
    intervalId = window.setInterval(() => {
      void syncDashboard(false);
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [authLoading, isOfflineSession, profile, scopedPlantId, user]);

  return useMemo(() => {
    const recentActivity = requests
      .map(requestToActivity)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 12);

    const pendingRequests = requests.filter((request) => text(request.data.status, "pending") === "pending").length;
    const todayConsumptions = assignments.filter((assignment) => isToday(toDate(assignment.data.assignedAt))).length;
    const openAlerts = alerts.filter((alert) => text(alert.data.status, "open") === "open").length;
    const criticalAlerts = alerts.filter((alert) => text(alert.data.severity) === "critical" && text(alert.data.status, "open") === "open").length;
    const stockValues = inventory.map((item) => readStock(item.data));
    const totalStock = stockValues.reduce((sum, stock) => sum + stock, 0);
    const lowStockItems = stockValues.filter((stock) => stock > 0 && stock <= LOW_STOCK_THRESHOLD).length;

    const summaries = new Map<string, LivePlantSummary>();
    const ensureSummary = (plantaId: string) => {
      const current = summaries.get(plantaId);
      if (current) return current;
      const next = {
        plantaId,
        label: plantLabel(plantaId),
        requests: 0,
        consumptions: 0,
        alerts: 0,
        lowStock: 0,
      };
      summaries.set(plantaId, next);
      return next;
    };

    requests.forEach((request) => {
      ensureSummary(docPlant(request.data)).requests += 1;
    });
    assignments.forEach((assignment) => {
      ensureSummary(docPlant(assignment.data)).consumptions += 1;
    });
    alerts.forEach((alert) => {
      if (text(alert.data.status, "open") === "open") {
        ensureSummary(docPlant(alert.data)).alerts += 1;
      }
    });
    inventory.forEach((item) => {
      const stock = readStock(item.data);
      if (stock > 0 && stock <= LOW_STOCK_THRESHOLD) {
        ensureSummary(docPlant(item.data)).lowStock += 1;
      }
    });

    return {
      loading,
      error,
      activePlantId: scopedPlantId,
      recentActivity,
      plantSummaries: Array.from(summaries.values()).sort((a, b) => a.label.localeCompare(b.label, "es")),
      pendingRequests,
      todayConsumptions,
      openAlerts,
      criticalAlerts,
      lowStockItems,
      totalStock,
    };
  }, [alerts, assignments, error, inventory, loading, requests, scopedPlantId]);
}
