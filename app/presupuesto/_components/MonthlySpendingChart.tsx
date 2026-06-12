import { AlertCircle, BarChart3 } from "lucide-react";
import type { BudgetGoal, BudgetSpending } from "@/lib/budget";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const compactCurrency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  notation: "compact",
  maximumFractionDigits: 1,
});

interface MonthlySpendingChartProps {
  spending: BudgetSpending | null;
  goal: BudgetGoal | null;
  loading: boolean;
}

export function MonthlySpendingChart({ spending, goal, loading }: MonthlySpendingChartProps) {
  const actual = MONTHS.map((_, index) => spending?.byMonth[String(index + 1)] ?? 0);
  const limits = MONTHS.map((_, index) => goal?.monthlyLimits?.[String(index + 1)] ?? 0);
  const maxValue = Math.max(1, ...actual, ...limits);

  return (
    <section className="enterprise-panel p-5 sm:p-6">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#F40009]" />
            <h2 className="text-base font-bold text-white">Gasto mensual</h2>
          </div>
          <p className="mt-1 text-xs text-white/40">Entregas valorizadas contra la meta configurada por mes.</p>
        </div>
        <div className="flex items-center gap-4 text-[11px] font-semibold text-white/45">
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#F40009]" /> Gasto</span>
          <span className="flex items-center gap-2"><span className="h-0.5 w-4 bg-white/45" /> Meta mensual</span>
        </div>
      </div>

      <div className="grid min-h-64 grid-cols-12 items-end gap-1 sm:gap-2" aria-busy={loading}>
        {MONTHS.map((month, index) => {
          const spent = actual[index];
          const monthlyLimit = limits[index];
          const height = spent > 0 ? Math.max(5, (spent / maxValue) * 100) : 2;
          const limitPosition = monthlyLimit > 0 ? (monthlyLimit / maxValue) * 100 : null;
          const overLimit = monthlyLimit > 0 && spent > monthlyLimit;
          return (
            <div key={month} className="flex min-w-0 flex-col items-center gap-2">
              <div className="relative flex h-48 w-full items-end justify-center rounded-sm bg-white/[0.035]">
                {limitPosition !== null && (
                  <span
                    className="absolute left-0 right-0 z-10 h-px bg-white/50"
                    style={{ bottom: `${Math.min(100, limitPosition)}%` }}
                    title={`Meta ${compactCurrency.format(monthlyLimit)}`}
                  />
                )}
                <div
                  className={`w-full max-w-8 rounded-t-sm transition-[height] duration-700 ${overLimit ? "bg-amber-400" : "bg-[#F40009]"}`}
                  style={{ height: `${height}%` }}
                  title={`${month}: ${compactCurrency.format(spent)}`}
                />
              </div>
              <span className="text-[10px] font-bold text-white/45 sm:text-xs">{month}</span>
              <span className="hidden text-[9px] text-white/35 md:block">{compactCurrency.format(spent)}</span>
            </div>
          );
        })}
      </div>

      {spending && spending.unpricedAssignmentCount > 0 && (
        <div className="mt-5 flex items-start gap-2 border-t border-white/8 pt-4 text-xs text-amber-300/80">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{spending.unpricedAssignmentCount} entregas no tienen costo en la asignacion ni en el catalogo y no se incluyen en el total.</span>
        </div>
      )}
    </section>
  );
}
