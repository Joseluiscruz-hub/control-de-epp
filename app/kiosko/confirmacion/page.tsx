"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createKioskRequest } from "@/lib/kiosk-api";
import { KioskRequestItem } from "@/lib/kiosk-types";
import { clearKioskSession, setKioskSessionBusy } from "@/lib/kiosk-session";
import { parseKioskSessionJson, useKioskSessionSnapshot } from "../use-kiosk-session-snapshot";
import { CheckCircle2, AlertTriangle, Clock, Loader2, HardHat } from "lucide-react";

export default function KioskoConfirmacionPage() {
  const router = useRouter();
  const { ready, employeeId, employeeName, pinVerified, solicitudRaw } = useKioskSessionSnapshot();
  const [step, setStep] = useState<"confirm" | "loading" | "done" | "error">("confirm");
  const solicitud = useMemo(() => {
    const parsed = parseKioskSessionJson<any>(solicitudRaw);
    return parsed && employeeId ? { ...parsed, employeeId } : null;
  }, [employeeId, solicitudRaw]);
  const [errorMsg, setErrorMsg] = useState("");
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    if (!ready) return;
    if (!solicitud || !pinVerified) {
      router.push("/kiosko");
    }
  }, [pinVerified, ready, router, solicitud]);

  const handleConfirm = async () => {
    if (!solicitud) return;
    setStep("loading");
    setKioskSessionBusy(true);
    try {
      const requestId = await createKioskRequest({
        employeeId: solicitud.employeeId,
        employeeName,
        items: [{
          itemId: solicitud.itemId,
          itemName: solicitud.itemName ?? solicitud.sku ?? solicitud.itemId,
          sku: solicitud.sku,
          size: solicitud.size || "N/A",
          replacementDays: Number(solicitud.replacementDays ?? 365),
          replacementReason: solicitud.reason,
          chargeAmount: solicitud.chargeAmount ?? 0,
          signatureDataUrl: solicitud.signatureDataUrl ?? null,
        } satisfies KioskRequestItem],
      });
      sessionStorage.setItem("kiosk_request_id", requestId);
      sessionStorage.removeItem("kiosk_solicitud");
      sessionStorage.removeItem("kiosk_selected_item");
      router.push("/kiosko/espera");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Error al procesar. Llama al supervisor.");
      setStep("error");
    } finally {
      setKioskSessionBusy(false);
    }
  };

  const REASON_MSGS: Record<string, { title: string; body: string; color: string }> = {
    vida_util: {
      title: "Reposición aprobada",
      body: "Tu EPP cumplió su vida útil. La entrega es sin costo.",
      color: "text-green-400",
    },
    desgaste: {
      title: "Cambio por uso aprobado",
      body: "Tu EPP se cambió por uso normal. La entrega es sin costo.",
      color: "text-amber-400",
    },
    extravio: {
      title: solicitud?.chargeAmount > 0 ? "Reposición con cargo" : "Sin cargo",
      body: solicitud?.chargeAmount > 0
        ? `Se aplicará un cargo de $${Number(solicitud?.chargeAmount).toFixed(2)} MXN en tu nómina. Revisa tu recibo.`
        : "Tu EPP ya había cumplido su vida útil. Sin cargo.",
      color: solicitud?.chargeAmount > 0 ? "text-red-400" : "text-green-400",
    },
  };

  const msg = solicitud ? REASON_MSGS[solicitud.reason] : null;

  if (!ready || !solicitud || !pinVerified) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 size={32} className="animate-spin text-amber-400" />
    </div>
  );

  if (step === "loading") return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6">
      <Loader2 size={56} className="animate-spin text-amber-400" />
      <p className="text-xl text-gray-300">Procesando solicitud...</p>
    </div>
  );

  if (step === "error") return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
      <AlertTriangle size={56} className="text-red-400" />
      <h2 className="text-2xl font-bold text-red-300">Ocurrió un error</h2>
      <p className="text-gray-400">{errorMsg}</p>
      <button onClick={() => router.push("/kiosko")} className="px-8 py-4 bg-white/10 rounded-lg text-white font-semibold">Ir al inicio</button>
    </div>
  );

  if (step === "done") return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8 text-center">
      {/* Animación check */}
      <div className="relative">
        <div className="w-28 h-28 rounded-full bg-green-400/10 border-2 border-green-400/40 flex items-center justify-center animate-pulse">
          <CheckCircle2 size={64} className="text-green-400" />
        </div>
      </div>
      <div>
        <h2 className={`text-2xl font-bold ${msg?.color ?? "text-white"}`}>{msg?.title}</h2>
        <p className="text-gray-400 mt-2 max-w-sm">{msg?.body}</p>
      </div>
      <div className="bg-white/5 rounded-lg px-6 py-4 border border-white/10 text-sm text-gray-300">
        <p>Empleado: <strong className="text-white">{employeeName}</strong></p>
        <p>SKU: <span className="font-mono text-amber-400">{solicitud.sku}</span></p>
        {solicitud.size !== "N/A" && <p>Talla: <strong className="text-white">{solicitud.size}</strong></p>}
      </div>
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <Clock size={14} />
        Regresando al inicio en <strong className="text-amber-400">{countdown}s</strong>
      </div>
      <button
        onClick={() => { clearKioskSession(); router.push("/kiosko"); }}
        className="px-8 py-4 bg-white/10 hover:bg-white/15 rounded-lg text-white font-semibold transition-colors"
      >
        Finalizar ahora
      </button>
    </div>
  );

  // Pantalla de confirmación previa
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8 max-w-md mx-auto w-full">
      <HardHat size={48} className="text-amber-400" />
      <h2 className="text-2xl font-bold text-center">Confirma tu solicitud</h2>

      <div className="w-full bg-white/5 rounded-lg border border-white/10 overflow-hidden">
        {[
          ["Empleado", employeeName],
          ["SKU", solicitud.sku],
          ...(solicitud.size !== "N/A" ? [["Talla", solicitud.size]] : []),
          ["Motivo", { vida_util: "Vida útil cumplida", desgaste: "Uso / desgaste normal", extravio: "Pérdida / robo / mal uso" }[solicitud.reason as string]],
          ...(solicitud.chargeAmount > 0 ? [["Cargo a nómina", `$${Number(solicitud.chargeAmount).toFixed(2)} MXN`]] : []),
        ].map(([label, value], i, arr) => (
          <div key={label} className={`flex justify-between px-5 py-3 text-sm ${i < arr.length - 1 ? "border-b border-white/10" : ""}`}>
            <span className="text-gray-400">{label}</span>
            <span className={`font-semibold ${label === "Cargo a nómina" ? "text-red-400" : "text-white"}`}>{value}</span>
          </div>
        ))}
      </div>

      {solicitud.reason === "extravio" && (
        <p className="text-red-200 text-sm text-center bg-red-900/20 border border-red-500/30 rounded-lg px-4 py-3">
          Si el EPP se pierde, se lo roban o se usa de forma incorrecta, la reposición será cobrada al colaborador por nómina.
        </p>
      )}

      <div className="flex flex-col gap-3 w-full">
        <button
          onClick={handleConfirm}
          className="w-full py-5 rounded-lg bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-gray-900 font-bold text-xl transition-colors"
        >
          Confirmar y Solicitar
        </button>
        <button
          onClick={() => router.push("/kiosko/solicitud")}
          className="w-full py-4 rounded-lg border border-white/10 text-gray-400 hover:text-white font-medium transition-colors"
        >
          Regresar
        </button>
      </div>
    </div>
  );
}
