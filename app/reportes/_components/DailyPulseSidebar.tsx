"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SummaryRow } from "../_hooks/useReportData";

export interface DailyPulseSidebarProps {
  summaryRows: SummaryRow[];
  loading: boolean;
  missingRows: number;
}

export function DailyPulseSidebar({
  summaryRows,
  loading,
  missingRows,
}: DailyPulseSidebarProps) {
  return (
    <aside className="space-y-4">
      <div className="enterprise-panel p-5">
        <p className="section-eyebrow">Pulso del dia</p>
        <div className="mt-4 space-y-3">
          {summaryRows.slice(0, 5).map((row) => (
            <div key={`pulse-${row.key}`} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{row.itemName}</p>
                  <p className="mt-1 text-xs font-semibold text-white/40">{row.area}</p>
                </div>
                <span className="rounded-md bg-white/10 px-2 py-1 text-xs font-black text-white">
                  {row.quantity}
                </span>
              </div>
            </div>
          ))}
          {!loading && summaryRows.length === 0 && (
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm font-semibold text-white/45">
              Sin lineas para mostrar.
            </div>
          )}
        </div>
      </div>

      <div className="enterprise-panel p-5">
        <div className="flex items-start gap-3">
          <span className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
            missingRows > 0
              ? "border-red-400/25 bg-red-500/10 text-red-200"
              : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
          )}>
            {missingRows > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          </span>
          <div>
            <p className="font-black text-white">Control SAP</p>
            <p className="mt-1 text-sm font-medium leading-relaxed text-white/50">
              {missingRows > 0
                ? "Hay lineas con empleado, area o material pendiente de validar."
                : "El corte esta completo para captura operativa."}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
