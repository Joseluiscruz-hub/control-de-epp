"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminKioskRequest, listAdminKioskRequests, updateKioskRequestStatus } from "@/lib/kiosk-api";
import { toast } from "sonner";

export function KioskRequestsPanel() {
  const [requests, setRequests] = useState<AdminKioskRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await listAdminKioskRequests("pending", 20);
      setRequests(data);
    } catch {
      toast.error("No se pudieron cargar las solicitudes de kiosko.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [refresh]);

  const resolve = async (requestId: string, status: "approved" | "rejected") => {
    setUpdatingId(requestId);
    try {
      await updateKioskRequestStatus(requestId, status);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      toast.success(status === "approved" ? "Solicitud aprobada." : "Solicitud rechazada.");
    } catch {
      toast.error("No se pudo actualizar el estado de la solicitud.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Card className="bg-white rounded-[3rem] border-none shadow-2xl overflow-hidden">
      <CardHeader className="p-10 pb-5 border-b border-slate-50">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-2xl font-black tracking-tight text-slate-900">Solicitudes de Kiosko</CardTitle>
          <Badge className="bg-amber-100 text-amber-700 border-none">{requests.length} pendientes</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
          </div>
        ) : requests.length === 0 ? (
          <div className="py-10 text-center text-slate-500 font-semibold">No hay solicitudes pendientes.</div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => (
              <div key={request.id} className="rounded-2xl border border-slate-100 p-4 bg-slate-50/50">
                <p className="font-bold text-slate-900">
                  #{request.employeeId} · {request.employeeName}
                </p>
                <ul className="mt-2 text-sm text-slate-600 list-disc pl-5">
                  {request.items.map((item) => (
                    <li key={`${request.id}-${item.itemId}-${item.sku}`}>
                      {item.itemName} · {item.sku} · {item.size}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={updatingId === request.id}
                    onClick={() => resolve(request.id, "approved")}
                  >
                    {updatingId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    disabled={updatingId === request.id}
                    onClick={() => resolve(request.id, "rejected")}
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
