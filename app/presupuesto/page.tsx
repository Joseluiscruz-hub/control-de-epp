"use client";

import { useState } from "react";
import { AlertTriangle, LockKeyhole, RefreshCw, Settings2, WalletCards } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLANTS, plantLabel, type ActivePlantId, type PlantScope } from "@/lib/plants";
import { usePlantStore } from "@/store/usePlantStore";
import { BudgetBreakdownTable } from "./_components/BudgetBreakdownTable";
import { BudgetGoalDialog } from "./_components/BudgetGoalDialog";
import { BudgetKPICards } from "./_components/BudgetKPICards";
import { BudgetProgressBar } from "./_components/BudgetProgressBar";
import { MonthlySpendingChart } from "./_components/MonthlySpendingChart";
import { useBudgetData } from "./_hooks/useBudgetData";

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, index) => currentYear - 2 + index);

export default function PresupuestoPage() {
  const { loading: authLoading, isGlobalAdmin } = useAuth();
  const { activePlantId, setActivePlant } = usePlantStore();
  const [year, setYear] = useState(currentYear);
  const [dialogOpen, setDialogOpen] = useState(false);
  const plantaId: PlantScope = activePlantId === "todas" ? "nacional" : activePlantId;
  const budget = useBudgetData(plantaId, year);

  if (authLoading) {
    return (
      <div className="enterprise-panel flex min-h-72 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-[#F40009]" />
      </div>
    );
  }

  if (!isGlobalAdmin) {
    return (
      <div className="enterprise-panel flex min-h-80 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10">
          <LockKeyhole className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">Acceso restringido</h1>
          <p className="mt-2 max-w-md text-sm leading-6 text-white/45">
            El control presupuestal consolidado esta disponible solo para administradores globales.
          </p>
        </div>
      </div>
    );
  }

  const activeAlerts = budget.alerts.filter((alert) => alert.triggered);

  return (
    <div className="space-y-6 pb-20">
      <section className="enterprise-panel p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F40009] shadow-lg shadow-red-950/30">
              <WalletCards className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0">
              <p className="section-eyebrow">Administracion financiera</p>
              <h1 className="mt-1 text-2xl font-black tracking-normal text-white sm:text-3xl">Control Presupuestal</h1>
              <p className="mt-1 text-xs text-white/40">{plantLabel(plantaId)} · gasto de EPP actualizado cada 30 segundos</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={activePlantId}
              onValueChange={(value) => setActivePlant((value || "todas") as ActivePlantId)}
            >
              <SelectTrigger className="h-9 min-w-44 border-white/10 bg-white/5 text-white" aria-label="Planta presupuestal">
                <SelectValue>{plantLabel(plantaId)}</SelectValue>
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0b0d12] text-white">
                <SelectItem value="todas">Nacional</SelectItem>
                {PLANTS.map((plant) => <SelectItem key={plant.id} value={plant.id}>{plant.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={String(year)} onValueChange={(value) => value && setYear(Number(value))}>
              <SelectTrigger className="h-9 w-28 border-white/10 bg-white/5 text-white" aria-label="Año presupuestal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0b0d12] text-white">
                {YEAR_OPTIONS.map((option) => <SelectItem key={option} value={String(option)}>{option}</SelectItem>)}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void budget.reload()}
              disabled={budget.loading}
              aria-label="Actualizar presupuesto"
              title="Actualizar presupuesto"
              className="h-9 w-9 border-white/10 bg-white/5 p-0 text-white/65 hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className={`h-4 w-4 ${budget.loading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              size="sm"
              onClick={() => setDialogOpen(true)}
              className="h-9 gap-2 bg-[#F40009] text-white hover:bg-red-700"
            >
              <Settings2 className="h-4 w-4" />
              Definir meta
            </Button>
          </div>
        </div>
      </section>

      {activeAlerts.length > 0 && (
        <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
          activeAlerts.some((alert) => alert.threshold >= 100)
            ? "border-red-500/30 bg-red-500/10 text-red-200"
            : "border-amber-500/30 bg-amber-500/10 text-amber-200"
        }`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Uso actual: {budget.pctUsed.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%.
            {" "}Umbrales alcanzados: {activeAlerts.map((alert) => `${alert.threshold}%`).join(", ")}.
          </span>
        </div>
      )}

      {budget.error && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {budget.error}
        </div>
      )}

      <BudgetKPICards
        goal={budget.goal}
        spending={budget.spending}
        pctUsed={budget.pctUsed}
        available={budget.available}
        loading={budget.loading}
      />

      {budget.goal ? (
        <BudgetProgressBar pctUsed={budget.pctUsed} thresholds={budget.goal.alertThresholds} />
      ) : !budget.loading && (
        <section className="enterprise-panel flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-bold text-white">Aun no hay una meta para {year}</h2>
            <p className="mt-1 text-sm text-white/40">El gasto ya se calcula; define la meta para activar avance, saldo y alertas.</p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="gap-2 bg-[#F40009] text-white hover:bg-red-700">
            <Settings2 className="h-4 w-4" />
            Configurar
          </Button>
        </section>
      )}

      <MonthlySpendingChart spending={budget.spending} goal={budget.goal} loading={budget.loading} />

      {budget.spending && (
        <BudgetBreakdownTable
          byCategory={budget.spending.byCategory}
          byArea={budget.spending.byArea}
          totalSpent={budget.spending.totalSpent}
        />
      )}

      {dialogOpen && (
        <BudgetGoalDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          goal={budget.goal}
          saving={budget.saving}
          onSave={budget.saveGoal}
          plantaId={plantaId}
          year={year}
        />
      )}
    </div>
  );
}
