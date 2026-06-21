"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { playNotificationSound } from "@/lib/notification-sounds";
import {
  calculateBudgetMetrics,
  type BudgetGoal,
  type BudgetSpending,
} from "@/lib/budget";
import type { PlantScope } from "@/lib/plants";

async function readApiError(response: Response, fallback: string) {
  try {
    const data = await response.json() as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export function useBudgetData(plantaId: PlantScope, year: number) {
  const { user, isOfflineSession } = useAuth();
  const [goal, setGoal] = useState<BudgetGoal | null>(null);
  const [spending, setSpending] = useState<BudgetSpending | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (isOfflineSession || typeof user.getIdToken !== "function") {
      setGoal(null);
      setSpending(null);
      setError("El control presupuestal requiere una sesion online para consultar Firebase.");
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const query = new URLSearchParams({ plantaId, year: String(year) });
      const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };
      const [goalResponse, spendingResponse] = await Promise.all([
        fetch(`/api/budget/goal?${query}`, { headers, cache: "no-store" }),
        fetch(`/api/budget/spending?${query}`, { headers, cache: "no-store" }),
      ]);

      if (!goalResponse.ok) {
        throw new Error(await readApiError(goalResponse, "No se pudo cargar la meta."));
      }
      if (!spendingResponse.ok) {
        throw new Error(await readApiError(spendingResponse, "No se pudo calcular el gasto."));
      }

      const goalData = await goalResponse.json() as { goal: BudgetGoal | null };
      const spendingData = await spendingResponse.json() as BudgetSpending;
      setGoal(goalData.goal);
      setSpending(spendingData);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Error al cargar el presupuesto.";
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isOfflineSession, plantaId, user, year]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(true), 30_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [load]);

  const saveGoal = useCallback(async (data: {
    annualLimit: number;
    monthlyLimits?: Record<string, number>;
  }) => {
    if (!user || isOfflineSession || typeof user.getIdToken !== "function") {
      toast.error("Conecta una sesion online para guardar la meta presupuestal.");
      return false;
    }
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/budget/goal", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          plantaId,
          year,
          alertThresholds: [80, 100],
          ...data,
        }),
      });
      if (!response.ok) {
        throw new Error(await readApiError(response, "No se pudo guardar la meta."));
      }
      toast.success("Meta presupuestal guardada.");
      await load(true);
      return true;
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "No se pudo guardar la meta.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [isOfflineSession, load, plantaId, user, year]);

  const metrics = useMemo(() => calculateBudgetMetrics(goal, spending), [goal, spending]);

  useEffect(() => {
    if (!goal || !spending) return;
    for (const alert of metrics.alerts.filter((candidate) => candidate.triggered)) {
      const key = `budget-alert:${plantaId}:${year}:${alert.threshold}`;
      if (window.sessionStorage.getItem(key)) continue;
      window.sessionStorage.setItem(key, "shown");
      playNotificationSound(alert.threshold >= 100 ? "critical" : "budget");
      toast.warning(`Presupuesto al ${alert.pct}%: se alcanzo el umbral de ${alert.threshold}%.`);
    }
  }, [goal, metrics.alerts, plantaId, spending, year]);

  return {
    goal,
    spending,
    loading,
    saving,
    error,
    ...metrics,
    saveGoal,
    reload: () => load(),
  };
}
