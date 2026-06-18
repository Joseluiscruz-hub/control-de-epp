"use client";

import { AlertTriangle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReorderAlert } from "../_hooks/useInventoryData";

interface ReorderAlertBannerProps {
  alerts: ReorderAlert[];
  onReview: () => void;
}

export function ReorderAlertBanner({ alerts, onReview }: ReorderAlertBannerProps) {
  if (alerts.length === 0) return null;

  const preview = alerts.slice(0, 6);

  return (
    <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-300/10 text-amber-200">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-200">
              SOLPED requerida
            </p>
            <p className="mt-1 text-sm font-semibold text-white/75">
              {alerts.length} material{alerts.length === 1 ? "" : "es"} alcanzaron su punto de pedido. Crear SOLPED para reabastecimiento.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {preview.map((alert) => (
                <span
                  key={`${alert.itemDocId}-${alert.material}-${alert.size ?? "na"}`}
                  className="rounded-md border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/70"
                >
                  {alert.material}{alert.size ? ` T${alert.size}` : ""}: {alert.stock}/{alert.reorderPoint} PZA
                </span>
              ))}
              {alerts.length > preview.length && (
                <span className="rounded-md bg-black/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/45">
                  +{alerts.length - preview.length} mas
                </span>
              )}
            </div>
          </div>
        </div>
        <Button
          onClick={onReview}
          className="h-11 shrink-0 rounded-xl bg-amber-400 px-5 text-[10px] font-black uppercase tracking-widest text-black hover:bg-amber-300"
        >
          <FileText className="mr-2 h-4 w-4" />
          Ver SOLPED
        </Button>
      </div>
    </div>
  );
}
