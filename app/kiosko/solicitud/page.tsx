"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getActiveAssignment } from "@/lib/kiosk-api";
import { PPECatalogItem, ReplacementReason } from "@/lib/kiosk-types";
import { evaluateReplacement, getStockStatus } from "@/lib/replacement-logic";
import {
  ArrowLeft, AlertTriangle, CheckCircle2,
  PenLine, DollarSign, RotateCcw, Loader2,
  HardHat,
} from "lucide-react";

const REASON_LABELS: Record<ReplacementReason, { label: string; icon: ReactNode; desc: string }> = {
  vida_util: { label: "Vida Útil Cumplida", icon: <CheckCircle2 size={22} />, desc: "Mi EPP ya completó su período de uso establecido." },
  desgaste:  { label: "Uso / Desgaste Normal", icon: <AlertTriangle size={22} />, desc: "Mi EPP se desgastó por uso de trabajo y necesito cambio." },
  extravio:  { label: "Pérdida / Robo / Mal Uso", icon: <DollarSign size={22} />, desc: "Perdí, me robaron o hice mal uso del EPP y necesito reposición." },
};

export default function KioskoSolicitudPage() {
  const router = useRouter();
  const employeeId = typeof window !== "undefined" ? sessionStorage.getItem("kiosk_employee_id") ?? "" : "";
  const [item] = useState<PPECatalogItem | null>(() => {
    if (typeof window === "undefined") return null;
    const raw = sessionStorage.getItem("kiosk_selected_item");
    return raw ? (JSON.parse(raw) as PPECatalogItem) : null;
  });
  const [selectedSize, setSelectedSize] = useState<string | null>(() =>
    item && !item.hasSizes && item.sku ? "N/A" : null
  );
  const [selectedSku, setSelectedSku] = useState<string | null>(() =>
    item && !item.hasSizes ? item.sku ?? null : null
  );
  const [reason, setReason] = useState<ReplacementReason | null>(null);
  const [lastAssignment, setLastAssignment] = useState<any>(null);
  const [loadingAssignment, setLoadingAssignment] = useState(() => Boolean(item && !item.hasSizes && item.sku && employeeId));
  const [signatureDone, setSignatureDone] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    const verified = sessionStorage.getItem("kiosk_pin_verified");
    if (!item || verified !== "true") {
      router.push("/kiosko");
    }
  }, [item, router]);

  // Cargar asignación activa cuando se selecciona SKU
  useEffect(() => {
    if (!selectedSku || !employeeId) return;
    let cancelled = false;

    void getActiveAssignment(employeeId, selectedSku).then((assignment) => {
      if (cancelled) return;
      setLastAssignment(assignment);
      setLoadingAssignment(false);
    });

    return () => {
      cancelled = true;
    };
  }, [employeeId, selectedSku]);

  const evaluation = useMemo(() => {
    if (!reason || !item) return null;

    if (lastAssignment?.assignedAt) {
      const assignedDate = lastAssignment.assignedAt.toDate
        ? lastAssignment.assignedAt.toDate()
        : new Date(lastAssignment.assignedAt);
      return evaluateReplacement(assignedDate, item.replacementDays, item.unitCost ?? 0, reason);
    }

    return {
      daysUsed: 0,
      daysRemaining: item.replacementDays,
      lifeUsedPct: 0,
      isEligibleFree: true,
      requiresEvidence: false,
      chargeAmount: 0,
      chargeDescription: "",
    };
  }, [item, lastAssignment, reason]);

  const showLossModal = reason === "extravio" && (evaluation?.chargeAmount ?? 0) > 0;

  const handleSizeSelect = (size: string, sku: string) => {
    setSelectedSize(size);
    setSelectedSku(sku);
    setLoadingAssignment(true);
    setLastAssignment(null);
    setReason(null);
  };

  const canProceed = () => {
    if (!selectedSku || !reason) return false;
    if (reason === "extravio" && (evaluation?.chargeAmount ?? 0) > 0 && !signatureDone) return false;
    return true;
  };

  const handleProceed = () => {
    if (!item || !selectedSku || !selectedSize || !reason) return;
    sessionStorage.setItem("kiosk_solicitud", JSON.stringify({
      itemId: item.id,
      sku: selectedSku,
      size: selectedSize,
      reason,
      replacementDays: item.replacementDays,
      chargeAmount: evaluation?.chargeAmount ?? 0,
    }));
    router.push("/kiosko/confirmacion");
  };

  // ── Canvas firma ──────────────────────────────────────────────────────────
  const startDraw = (e: React.PointerEvent) => {
    setIsDrawing(true);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const r = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
  };
  const draw = (e: React.PointerEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const r = canvas.getBoundingClientRect();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
    ctx.stroke();
  };
  const endDraw = () => {
    setIsDrawing(false);
    setSignatureDone(true);
  };
  const clearSig = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDone(false);
  };

  if (!item) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 size={32} className="animate-spin text-amber-400" />
    </div>
  );

  const sizes = item.hasSizes && item.sizes ? Object.entries(item.sizes) : [];

  return (
    <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-6 py-6 gap-6">
      <button onClick={() => router.push("/kiosko/catalogo")} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors self-start">
        <ArrowLeft size={18} /> Catálogo
      </button>

      {/* Item header */}
      <div className="flex items-center gap-4 bg-white/5 rounded-lg p-4 border border-white/10">
        <span className="h-14 w-14 rounded-lg border border-amber-400/20 bg-amber-400/10 text-amber-300 flex items-center justify-center">
          <HardHat className="h-7 w-7" />
        </span>
        <div>
          <h2 className="text-xl font-bold">{item.name}</h2>
          <p className="text-sm text-gray-400">{item.category} · Vida útil: {item.replacementDays} días</p>
          {item.unitCost && <p className="text-xs text-gray-500">Costo unitario: ${item.unitCost.toFixed(2)} MXN</p>}
        </div>
      </div>

      {/* Sección 1: Tallas */}
      {item.hasSizes && sizes.length > 0 && (
        <section>
          <h3 className="text-base font-semibold mb-3 text-gray-300">1. Selecciona tu talla</h3>
          <div className="flex flex-wrap gap-3">
             {sizes.map(([size, variant]) => {
                const stock = variant.stock;
                const hasNumericStock = typeof stock === "number";
                const status = hasNumericStock
                  ? getStockStatus(stock, variant.minStock ?? 0)
                  : (variant.available === true ? "ok" : "empty");
                const isDisabled = status === "empty";
                const stockLabel = hasNumericStock
                  ? (status === "empty" ? "Sin stock" : `${stock} disp.`)
                  : (status === "ok" ? "Disponible" : "Sin stock");
                return (
                  <button
                   key={size}
                   disabled={isDisabled}
                   onClick={() => handleSizeSelect(size, variant.sku)}
                   className={`relative flex flex-col items-center gap-1 px-5 py-3 rounded-lg border-2 text-sm font-bold transition-all active:scale-95
                     ${selectedSize === size ? "border-amber-400 bg-amber-400/10 text-amber-400"
                    : isDisabled ? "border-gray-700 text-gray-600 opacity-40 cursor-not-allowed"
                    : "border-gray-700 text-white hover:border-gray-500"}`}
                 >
                    {size}
                    <span className={`text-xs font-normal ${status === "ok" ? "text-green-400" : status === "low" ? "text-amber-400" : "text-red-400"}`}>
                      {stockLabel}
                    </span>
                   <span className="text-xs text-gray-600 font-mono">{variant.sku}</span>
                 </button>
               );
            })}
          </div>
        </section>
      )}

      {/* Sección 2: Motivo */}
      {selectedSku && (
        <section>
          <h3 className="text-base font-semibold mb-3 text-gray-300">
            {item.hasSizes ? "2." : "1."} Motivo de la solicitud
          </h3>

          {loadingAssignment ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> Verificando historial...
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(Object.entries(REASON_LABELS) as [ReplacementReason, typeof REASON_LABELS[ReplacementReason]][]).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setReason(key)}
                  className={`flex items-start gap-4 p-4 rounded-lg border-2 text-left transition-all
                    ${reason === key
                      ? key === "extravio" ? "border-red-500 bg-red-900/20"
                      : key === "desgaste" ? "border-amber-500 bg-amber-900/20"
                      : "border-green-500 bg-green-900/20"
                    : "border-gray-700 bg-gray-800 hover:border-gray-600"}`}
                >
                  <span className={`mt-0.5 ${key === "extravio" ? "text-red-400" : key === "desgaste" ? "text-amber-400" : "text-green-400"}`}>
                    {val.icon}
                  </span>
                  <div>
                    <p className="font-semibold text-white">{val.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{val.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Evaluación resultado */}
      {evaluation && reason && (
        <div className={`rounded-lg p-4 border text-sm
          ${reason === "vida_util" ? "border-green-500/30 bg-green-900/10"
          : reason === "desgaste" ? "border-amber-500/30 bg-amber-900/10"
          : "border-red-500/30 bg-red-900/10"}`}>
          {reason === "vida_util" && (
            <p className="text-green-300 flex items-center gap-2">
              <CheckCircle2 size={16} /> Tu EPP ha cumplido su vida útil ({evaluation.daysUsed} días). Reposición <strong>gratuita</strong>.
            </p>
          )}
          {reason === "desgaste" && (
            <p className="text-amber-300 flex items-center gap-2">
              <AlertTriangle size={16} /> Cambio por uso normal. La reposición se realizará <strong>sin cargo</strong>.
            </p>
          )}
          {reason === "extravio" && evaluation.chargeAmount === 0 && (
            <p className="text-green-300 flex items-center gap-2">
              <CheckCircle2 size={16} /> Tu EPP ya cumplió su vida útil. Reposición <strong>gratuita</strong>.
            </p>
          )}
          {reason === "extravio" && evaluation.chargeAmount > 0 && (
            <p className="text-red-300 flex items-center gap-2">
              <DollarSign size={16} /> Cargo por extravío: <strong>${evaluation.chargeAmount.toFixed(2)} MXN</strong> — {evaluation.chargeDescription}
            </p>
          )}
        </div>
      )}

      {/* Firma digital (extravío con cobro) */}
      {showLossModal && reason === "extravio" && (evaluation?.chargeAmount ?? 0) > 0 && (
        <section>
          <h3 className="text-base font-semibold mb-1 text-red-300">Firma de responsiva</h3>
          <p className="text-xs text-gray-500 mb-3">
            Al firmar autorizas el descuento de <strong>${evaluation!.chargeAmount.toFixed(2)} MXN</strong> en tu próxima nómina.
          </p>
          <div className="relative border-2 border-gray-600 rounded-lg overflow-hidden bg-gray-900">
            <canvas
              ref={canvasRef}
              width={480}
              height={120}
              className="w-full touch-none"
              onPointerDown={startDraw}
              onPointerMove={draw}
              onPointerUp={endDraw}
            />
            {!signatureDone && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-gray-600 text-sm flex items-center gap-2">
                  <PenLine size={16} /> Firma aquí con tu dedo
                </span>
              </div>
            )}
          </div>
          {signatureDone && (
            <button onClick={clearSig} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 mt-2">
              <RotateCcw size={12} /> Limpiar firma
            </button>
          )}
        </section>
      )}

      {/* CTA */}
      <button
        onClick={handleProceed}
        disabled={!canProceed()}
        className="w-full py-5 rounded-lg bg-amber-400 hover:bg-amber-300 active:bg-amber-500 disabled:opacity-30 text-gray-900 font-bold text-xl transition-colors mt-auto"
      >
        Confirmar Solicitud
      </button>
    </div>
  );
}
