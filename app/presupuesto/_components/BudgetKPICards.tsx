import { CircleDollarSign, Gauge, PiggyBank, Target } from "lucide-react";
import type { BudgetGoal, BudgetSpending } from "@/lib/budget";

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

interface BudgetKPICardsProps {
  goal: BudgetGoal | null;
  spending: BudgetSpending | null;
  pctUsed: number;
  available: number | null;
  loading: boolean;
}

export function BudgetKPICards({ goal, spending, pctUsed, available, loading }: BudgetKPICardsProps) {
  const projectedDelta = goal && spending ? spending.projected - goal.annualLimit : 0;
  const cards = [
    {
      label: "Meta anual",
      value: goal ? currency.format(goal.annualLimit) : "Sin definir",
      detail: goal ? `${goal.currency} para el periodo` : "Configura una meta para medir el avance",
      icon: Target,
      color: "text-white",
    },
    {
      label: "Gastado",
      value: spending ? currency.format(spending.totalSpent) : currency.format(0),
      detail: `${pctUsed.toLocaleString("es-MX", { maximumFractionDigits: 1 })}% de la meta`,
      icon: CircleDollarSign,
      color: pctUsed >= 100 ? "text-red-400" : pctUsed >= 80 ? "text-amber-400" : "text-emerald-400",
    },
    {
      label: "Disponible",
      value: available === null ? "Sin meta" : currency.format(available),
      detail: available === 0 && goal ? "Presupuesto agotado" : "Saldo presupuestal",
      icon: PiggyBank,
      color: available === 0 && goal ? "text-red-400" : "text-sky-400",
    },
    {
      label: "Proyeccion",
      value: spending ? currency.format(spending.projected) : currency.format(0),
      detail: goal && projectedDelta !== 0
        ? `${projectedDelta > 0 ? "+" : ""}${currency.format(projectedDelta)} vs. meta`
        : "Estimacion al cierre del año",
      icon: Gauge,
      color: goal && projectedDelta > 0 ? "text-amber-400" : "text-violet-300",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="kpi-card min-h-40 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="section-eyebrow mb-3">{card.label}</p>
                <p className={`break-words text-2xl font-black tracking-normal ${card.color}`}>
                  {loading ? "Cargando..." : card.value}
                </p>
                <p className="mt-2 text-xs leading-5 text-white/40">{card.detail}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                <Icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
