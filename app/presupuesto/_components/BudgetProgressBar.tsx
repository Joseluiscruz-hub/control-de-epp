interface BudgetProgressBarProps {
  pctUsed: number;
  thresholds: number[];
}

export function BudgetProgressBar({ pctUsed, thresholds }: BudgetProgressBarProps) {
  const warningThreshold = thresholds[0] ?? 80;
  const criticalThreshold = thresholds[thresholds.length - 1] ?? 100;
  const color = pctUsed >= criticalThreshold
    ? "bg-red-500"
    : pctUsed >= warningThreshold
      ? "bg-amber-400"
      : "bg-emerald-500";

  return (
    <section className="enterprise-panel p-5" aria-label="Avance presupuestal">
      <div className="mb-3 flex items-center justify-between gap-4 text-sm">
        <span className="font-semibold text-white">Presupuesto utilizado</span>
        <span className="font-mono font-bold text-white">
          {pctUsed.toLocaleString("es-MX", { maximumFractionDigits: 1 })}%
        </span>
      </div>
      <div className="relative h-3 w-full rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${color}`}
          style={{ width: `${Math.min(100, pctUsed)}%` }}
        />
        {thresholds.map((threshold) => (
          <span
            key={threshold}
            className="absolute top-0 h-3 w-px bg-white/60"
            style={{ left: `${Math.min(100, threshold)}%` }}
          />
        ))}
      </div>
      <div className="relative mt-2 h-4">
        {thresholds.map((threshold) => (
          <span
            key={threshold}
            className="absolute -translate-x-1/2 text-[10px] font-bold text-white/40"
            style={{ left: `${Math.min(100, threshold)}%` }}
          >
            {threshold}%
          </span>
        ))}
      </div>
    </section>
  );
}
