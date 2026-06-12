"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BudgetGoal } from "@/lib/budget";
import { plantLabel, type PlantScope } from "@/lib/plants";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

interface BudgetGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: BudgetGoal | null;
  saving: boolean;
  onSave: (data: { annualLimit: number; monthlyLimits?: Record<string, number> }) => Promise<boolean>;
  plantaId: PlantScope;
  year: number;
}

export function BudgetGoalDialog({
  open,
  onOpenChange,
  goal,
  saving,
  onSave,
  plantaId,
  year,
}: BudgetGoalDialogProps) {
  const [annualLimit, setAnnualLimit] = useState(() => goal ? String(goal.annualLimit) : "");
  const [monthlyLimits, setMonthlyLimits] = useState<Record<string, string>>(() => Object.fromEntries(
      Object.entries(goal?.monthlyLimits ?? {}).map(([month, value]) => [month, String(value)])
    ));

  const monthlyTotal = useMemo(() => Object.values(monthlyLimits).reduce((sum, value) => {
    const parsed = Number(value);
    return sum + (Number.isFinite(parsed) ? parsed : 0);
  }, 0), [monthlyLimits]);

  const parsedAnnualLimit = Number(annualLimit);
  const canSave = Number.isFinite(parsedAnnualLimit) && parsedAnnualLimit > 0;

  const handleSave = async () => {
    if (!canSave) return;
    const normalizedMonthly = Object.fromEntries(
      Object.entries(monthlyLimits)
        .map(([month, value]) => [month, Number(value)] as const)
        .filter(([, value]) => Number.isFinite(value) && value > 0)
    );
    const saved = await onSave({
      annualLimit: parsedAnnualLimit,
      ...(Object.keys(normalizedMonthly).length > 0 ? { monthlyLimits: normalizedMonthly } : {}),
    });
    if (saved) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-white/10 bg-[#0b0d12] text-white sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-black">Meta presupuestal</DialogTitle>
          <DialogDescription>
            {plantLabel(plantaId)} · {year}. Las alertas se activan al 80% y 100%.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-2">
            <Label htmlFor="annual-limit">Meta anual (MXN)</Label>
            <Input
              id="annual-limit"
              type="number"
              inputMode="decimal"
              min={1}
              value={annualLimit}
              onChange={(event) => setAnnualLimit(event.target.value)}
              placeholder="850000"
              className="h-10"
            />
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-4">
              <div>
                <Label>Limites mensuales opcionales</Label>
                <p className="mt-1 text-xs text-white/40">Se muestran como referencia en la grafica mensual.</p>
              </div>
              <span className="text-xs font-semibold text-white/45">
                Total: {monthlyTotal.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {MONTHS.map((month, index) => {
                const key = String(index + 1);
                return (
                  <div key={month} className="space-y-1.5">
                    <Label htmlFor={`budget-month-${key}`} className="text-xs text-white/55">{month}</Label>
                    <Input
                      id={`budget-month-${key}`}
                      type="number"
                      inputMode="decimal"
                      min={1}
                      value={monthlyLimits[key] ?? ""}
                      onChange={(event) => setMonthlyLimits((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder="Opcional"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="border-white/8 bg-white/[0.025]">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !canSave} className="gap-2 bg-[#F40009] text-white hover:bg-red-700">
            {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Guardando" : "Guardar meta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
