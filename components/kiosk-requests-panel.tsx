"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, HardHat, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminKioskRequest, listAdminKioskRequests, updateKioskRequestStatus } from "@/lib/kiosk-api";
import { toast } from "sonner";

const REASON_LABELS: Record<string, string> = {
  vida_util: "Vida útil",
  desgaste: "Uso normal",
  extravio: "Pérdida/robo/mal uso",
};

const REFRESH_MS = 15_000;

function alertDateLabel(value: unknown) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildAlertSummary(request: AdminKioskRequest) {
  const warnings = request.earlyReplacementWarnings ?? [];
  if (warnings.length === 0) return "La solicitud tiene EPP antes de cumplir vida util.";
  return warnings
    .slice(0, 3)
    .map((warning) => `${warning.itemName}: faltan ${warning.daysRemaining} dias`)
    .join(" | ");
}

export function KioskRequestsPanel() {
  const [requests, setRequests] = useState<AdminKioskRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const warnedRequestIds = useRef(new Set<string>());
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async (silent = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setLoadError(false);
    try {
      const data = await listAdminKioskRequests("pending", 20);
      setRequests(data);
      const newEarlyAlerts = data.filter((request) => (
        request.hasEarlyReplacementAlert && !warnedRequestIds.current.has(request.id)
      ));
      if (newEarlyAlerts.length > 0) {
        newEarlyAlerts.forEach((request) => warnedRequestIds.current.add(request.id));
        const first = newEarlyAlerts[0];
        toast.warning("Alerta de vida util en kiosko", {
          description: `${first.employeeName}: ${buildAlertSummary(first)}${
            newEarlyAlerts.length > 1 ? ` (+${newEarlyAlerts.length - 1} mas)` : ""
          }`,
          duration: 9000,
        });
      }
    } catch (error) {
      console.error("[Kiosk requests load error]", error);
      setLoadError(true);
      if (!silent) toast.error("No se pudieron cargar las solicitudes de kiosko.");
    } finally {
      setLoading(false);
      refreshInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh();
    }, 0);
    const interval = window.setInterval(() => {
      void refresh(true);
    }, REFRESH_MS);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const resolve = async (request: AdminKioskRequest, status: "approved" | "rejected") => {
    if (status === "approved" && request.hasEarlyReplacementAlert) {
      const confirmed = window.confirm(
        `Esta solicitud tiene alerta de vida util.\n\n${buildAlertSummary(request)}\n\n¿Deseas aprobarla de todos modos?`
      );
      if (!confirmed) return;
    }

    const requestId = request.id;
    setUpdatingId(requestId);
    try {
      await updateKioskRequestStatus(requestId, status);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      toast.success(status === "approved" ? "Solicitud aprobada." : "Solicitud rechazada.");
    } catch (error) {
      console.error("[Kiosk request status update error]", error);
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar el estado de la solicitud.");
    } finally {
      setUpdatingId(null);
    }
  };

  const earlyAlertCount = requests.filter((request) => request.hasEarlyReplacementAlert).length;
  const criticalAlertCount = requests.filter((request) => (
    request.earlyReplacementWarnings?.some((warning) => warning.severity === "critical")
  )).length;

  return (
    <Card className="enterprise-panel gap-0 py-0">
      <CardHeader className="p-5 border-b border-white/10">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg border border-amber-400/20 bg-amber-400/10 flex items-center justify-center">
              <HardHat className="h-4 w-4 text-amber-300" />
            </div>
            <div>
              <CardTitle className="text-base font-bold tracking-tight text-white">Solicitudes de Kiosko</CardTitle>
              <p className="section-eyebrow mt-0.5">Flujo de aprobación</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {earlyAlertCount > 0 && (
              <Badge className="rounded-md border border-red-400/25 bg-red-500/10 text-red-200">
                {earlyAlertCount} vida util
              </Badge>
            )}
            {criticalAlertCount > 0 && (
              <Badge className="rounded-md border border-red-400/35 bg-red-600/15 text-red-200">
                {criticalAlertCount} criticas
              </Badge>
            )}
            <Badge className="rounded-md border border-amber-400/20 bg-amber-400/10 text-amber-300">{requests.length} pendientes</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          </div>
        ) : loadError ? (
          <div className="py-10 text-center space-y-4">
            <p className="text-white/50 font-semibold">No se pudieron cargar las solicitudes.</p>
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg border-white/15 bg-white/5 text-white hover:bg-white/10"
              onClick={() => {
                setLoading(true);
                void refresh();
              }}
            >
              Reintentar
            </Button>
          </div>
        ) : requests.length === 0 ? (
          <div className="py-10 text-center text-white/45 font-semibold">No hay solicitudes pendientes.</div>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <div
                key={request.id}
                className={`surface-action p-4 ${
                  request.hasEarlyReplacementAlert ? "border-amber-400/35 bg-amber-500/10" : ""
                }`}
              >
                <p className="font-bold text-white">
                  #{request.employeeId} · {request.employeeName}
                </p>
                {request.employeeArea && (
                  <p className="mt-1 text-xs font-bold uppercase tracking-widest text-white/35">
                    {request.employeeArea}
                  </p>
                )}
                {request.hasEarlyReplacementAlert && (
                  <div className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/10 p-3 text-sm font-semibold text-amber-100">
                    <div className="flex items-center gap-2 text-amber-50">
                      <AlertTriangle className="h-4 w-4 text-amber-300" />
                      Alerta admin: EPP solicitado antes de cumplir vida util.
                    </div>
                    <div className="mt-2 space-y-1 text-xs font-medium text-amber-100/75">
                      {(request.earlyReplacementWarnings ?? []).map((warning) => (
                        <p key={`${warning.itemId}-${warning.sku}-${warning.size}`}>
                          <span className={warning.severity === "critical" ? "text-red-200" : "text-amber-100"}>
                            {warning.severity === "critical" ? "Critica" : "Preventiva"}
                          </span>
                          {" · "}
                          {warning.itemName}: usado {warning.daysUsed} de {warning.replacementDays} dias,
                          faltan {warning.daysRemaining} dias
                          {warning.nextEligibleAt ? ` (libre desde ${alertDateLabel(warning.nextEligibleAt)})` : ""}.
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                <ul className="mt-2 text-sm text-white/55 list-disc pl-5">
                  {request.items.map((item) => (
                    <li key={`${request.id}-${item.itemId}-${item.sku}`}>
                      {item.itemName} · {item.sku} · {item.size}
                      {item.replacementReason && (
                        <span className="ml-1 text-amber-300">· {REASON_LABELS[item.replacementReason] ?? item.replacementReason}</span>
                      )}
                      {item.earlyReplacementAlert && (
                        <span className="ml-1 text-red-300">· anticipado</span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                    disabled={updatingId === request.id}
                    onClick={() => resolve(request, "approved")}
                  >
                    {updatingId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {request.hasEarlyReplacementAlert ? "Aprobar con alerta" : "Aprobar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-lg border-red-400/25 bg-red-400/10 text-red-300 hover:bg-red-400/15 hover:text-red-200"
                    disabled={updatingId === request.id}
                    onClick={() => resolve(request, "rejected")}
                  >
                    <X className="h-4 w-4" />
                    Rechazar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
