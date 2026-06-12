import { Layers3, UsersRound } from "lucide-react";

const currency = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});

function BreakdownList({ data, total }: { data: Record<string, number>; total: number }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-white/35">Sin gasto registrado en el periodo.</p>;
  }

  return (
    <div className="divide-y divide-white/8">
      {rows.map(([label, value]) => {
        const pct = total > 0 ? (value / total) * 100 : 0;
        return (
          <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold text-white/75" title={label}>{label}</span>
                <span className="text-[10px] font-bold text-white/35">{pct.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-[#F40009]" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </div>
            <span className="whitespace-nowrap text-sm font-bold text-white">{currency.format(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

interface BudgetBreakdownTableProps {
  byCategory: Record<string, number>;
  byArea: Record<string, number>;
  totalSpent: number;
}

export function BudgetBreakdownTable({ byCategory, byArea, totalSpent }: BudgetBreakdownTableProps) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <section className="enterprise-panel p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-[#F40009]" />
          <h2 className="text-base font-bold text-white">Por categoria</h2>
        </div>
        <BreakdownList data={byCategory} total={totalSpent} />
      </section>
      <section className="enterprise-panel p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-sky-400" />
          <h2 className="text-base font-bold text-white">Por area</h2>
        </div>
        <BreakdownList data={byArea} total={totalSpent} />
      </section>
    </div>
  );
}
