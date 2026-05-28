"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Boxes, Clock3, HardHat, Loader2, RadioTower, ShieldAlert, TrendingDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlantContextSwitcher } from "@/components/plant-context-switcher";
import { plantLabel } from "@/lib/plants";
import { useLiveDashboard } from "@/hooks/useLiveDashboard";

function MetricCard({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  const toneClass = {
    neutral: "border-white/10 bg-white/[0.04] text-white",
    green: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-400/25 bg-amber-500/10 text-amber-100",
    red: "border-red-400/25 bg-red-500/10 text-red-100",
  }[tone];

  return (
    <div className={`rounded-lg border p-5 ${toneClass}`}>
      <div className="flex items-center justify-between gap-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-current/15 bg-black/10">
          {icon}
        </span>
        <span className="text-3xl font-black tracking-tight">{value}</span>
      </div>
      <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] opacity-60">{label}</p>
    </div>
  );
}

function statusLabel(status: string) {
  if (status === "approved") return "Aprobada";
  if (status === "rejected") return "Rechazada";
  return "Pendiente";
}

export default function TorreDeControlPage() {
  const dashboard = useLiveDashboard();

  return (
    <div className="space-y-6 pb-20">
      <section className="enterprise-panel overflow-hidden">
        <div className="flex flex-col gap-5 border-b border-white/10 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 text-red-200">
              <RadioTower className="h-6 w-6" />
            </div>
            <div>
              <p className="section-eyebrow">Torre de control</p>
              <h1 className="text-2xl font-black tracking-tight text-white">Monitoreo Multi-Planta</h1>
              <p className="mt-1 text-sm font-semibold text-white/45">
                {dashboard.activePlantId === "todas"
                  ? "Vista nacional consolidada"
                  : plantLabel(dashboard.activePlantId)}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <PlantContextSwitcher />
            <Badge className="h-9 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 text-emerald-200">
              {dashboard.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock3 className="h-3.5 w-3.5" />}
              En vivo
            </Badge>
          </div>
        </div>

        {dashboard.error && (
          <div className="m-5 rounded-lg border border-amber-400/25 bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">
            {dashboard.error}
          </div>
        )}

        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Solicitudes pendientes"
            value={dashboard.pendingRequests}
            icon={<HardHat className="h-4 w-4" />}
            tone={dashboard.pendingRequests > 0 ? "amber" : "green"}
          />
          <MetricCard
            label="Consumos hoy"
            value={dashboard.todayConsumptions}
            icon={<Boxes className="h-4 w-4" />}
            tone="green"
          />
          <MetricCard
            label="Alertas abiertas"
            value={dashboard.openAlerts}
            icon={<ShieldAlert className="h-4 w-4" />}
            tone={dashboard.openAlerts > 0 ? "red" : "green"}
          />
          <MetricCard
            label="Stock bajo"
            value={dashboard.lowStockItems}
            icon={<TrendingDown className="h-4 w-4" />}
            tone={dashboard.lowStockItems > 0 ? "amber" : "neutral"}
          />
          <MetricCard
            label="Unidades inventario"
            value={dashboard.totalStock.toLocaleString("es-MX")}
            icon={<Boxes className="h-4 w-4" />}
          />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="enterprise-panel gap-0 py-0">
          <CardHeader className="border-b border-white/10 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="section-eyebrow">Actividad</p>
                <CardTitle className="text-lg font-black text-white">Solicitudes recientes</CardTitle>
              </div>
              {dashboard.criticalAlerts > 0 && (
                <Badge className="rounded-md border border-red-400/25 bg-red-500/10 text-red-200">
                  {dashboard.criticalAlerts} criticas
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {dashboard.loading ? (
              <div className="flex h-72 items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-red-400" />
              </div>
            ) : dashboard.recentActivity.length === 0 ? (
              <div className="flex h-72 items-center justify-center px-6 text-center text-sm font-semibold text-white/45">
                No hay actividad registrada para el contexto seleccionado.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full premium-table">
                  <thead>
                    <tr className="bg-white/[0.02]">
                      <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-white/35">Colaborador</th>
                      <th className="py-4 text-left text-[10px] font-black uppercase tracking-widest text-white/35">EPP</th>
                      <th className="py-4 text-left text-[10px] font-black uppercase tracking-widest text-white/35">Planta</th>
                      <th className="py-4 text-right text-[10px] font-black uppercase tracking-widest text-white/35">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.recentActivity.map((activity) => (
                      <tr key={activity.id} className="border-b border-white/10 hover:bg-white/[0.03]">
                        <td className="px-5 py-4">
                          <p className="font-bold text-white">{activity.employeeName}</p>
                          <p className="mt-1 font-mono text-xs text-white/35">#{activity.employeeId} · {activity.employeeArea}</p>
                        </td>
                        <td className="py-4">
                          <div className="flex items-center gap-2">
                            {activity.hasEarlyReplacementAlert && <AlertTriangle className="h-4 w-4 text-amber-300" />}
                            <p className="max-w-[320px] truncate text-sm font-semibold text-white/75">{activity.itemLabel}</p>
                          </div>
                        </td>
                        <td className="py-4 text-sm font-semibold text-white/55">{plantLabel(activity.plantaId)}</td>
                        <td className="py-4 pr-5 text-right">
                          <Badge className="rounded-md border border-white/10 bg-white/5 text-white/60">
                            {statusLabel(activity.status)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card className="enterprise-panel gap-0 py-0">
            <CardHeader className="border-b border-white/10 p-5">
              <p className="section-eyebrow">Plantas</p>
              <CardTitle className="text-lg font-black text-white">Pulso operativo</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {dashboard.plantSummaries.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm font-semibold text-white/45">
                  Sin datos para agrupar.
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboard.plantSummaries.map((plant) => (
                    <div key={plant.plantaId} className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-black text-white">{plant.label}</p>
                        {plant.alerts > 0 && (
                          <Badge className="rounded-md border border-red-400/25 bg-red-500/10 text-red-200">
                            {plant.alerts} alertas
                          </Badge>
                        )}
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-lg font-black text-white">{plant.requests}</p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Solicitudes</p>
                        </div>
                        <div>
                          <p className="text-lg font-black text-emerald-200">{plant.consumptions}</p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Consumos</p>
                        </div>
                        <div>
                          <p className="text-lg font-black text-amber-200">{plant.lowStock}</p>
                          <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Stock bajo</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </section>
    </div>
  );
}
