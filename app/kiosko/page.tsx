"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getEmployeeById } from "@/lib/kiosk-api";
import { Loader2, HardHat, ShieldCheck } from "lucide-react";
import { clearKioskSession, setKioskSessionBusy } from "@/lib/kiosk-session";

function getKioskConnectionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : 0;
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";

  if (status === 401 && message.includes("App Check")) {
    return "No se pudo validar App Check. Recarga el kiosko e intenta de nuevo.";
  }

  if (code === "permission-denied") {
    return "El kiosko no tiene permisos. Sincroniza desde el panel de Empleados.";
  }

  if (code === "unavailable") {
    return "No hay conexión con el servidor corporativo.";
  }

  return "Error de autenticación. Intenta de nuevo.";
}

export default function KioskoHomePage() {
  const router = useRouter();
  const [empId, setEmpId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleContinue = async () => {
    if (!empId.trim()) return;
    setLoading(true);
    setKioskSessionBusy(true);
    setError("");
    try {
      const emp = await getEmployeeById(empId.trim());
      if (!emp) {
        setError("Número de empleado no encontrado. Verifica con tu supervisor.");
        setLoading(false);
        return;
      }
      if (!emp.active) {
        setError("Colaborador inactivo. Contacta a Seguridad Industrial.");
        setLoading(false);
        return;
      }

      clearKioskSession();
      sessionStorage.setItem("kiosk_employee_id", emp.id);
      sessionStorage.setItem("kiosk_employee_name", emp.name);
      sessionStorage.setItem("kiosk_employee_plant", emp.plantaId ?? "");
      sessionStorage.setItem("kiosk_first_login", String(Boolean(emp.firstLogin)));
      sessionStorage.setItem("kiosk_terms_accepted", String(Boolean(emp.termsAccepted)));

      if (emp.firstLogin || !emp.termsAccepted) {
        router.push("/kiosko/setup");
        return;
      }

      router.push("/kiosko/login");
    } catch (error) {
      console.error("[Kiosko employee lookup error]", error);
      setError(getKioskConnectionErrorMessage(error));
      setLoading(false);
    } finally {
      setKioskSessionBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 px-8 py-14 relative overflow-hidden bg-[#07090d]">
      {/* ── Background Elements ──────────────── */}
      <div className="absolute inset-0 pointer-events-none">
         <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
         <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(245,158,11,0.14),transparent_40%,rgba(244,0,9,0.05))]" />
      </div>

      <div className="flex flex-col items-center gap-4 text-center relative z-10">
        <div className="w-20 h-20 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shadow-xl shadow-black/30 mb-2">
          <HardHat size={48} className="text-amber-500" />
        </div>
        <h1 className="text-4xl font-black text-white tracking-tight uppercase">Kiosko EPP</h1>
        <div className="flex items-center gap-2 text-amber-500 font-bold text-[10px] tracking-widest uppercase">
          <ShieldCheck className="h-4 w-4" /> Coca-Cola FEMSA
        </div>
        <p className="text-white/50 max-w-sm text-sm font-medium mt-2">
          Ingresa tu número de nómina corporativa para acceder a tu dotación.
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-5 relative z-10">
        <div className="relative">
          <input
            type="tel"
            inputMode="numeric"
            placeholder="Ej. 1881"
            value={empId}
            onChange={e => setEmpId(e.target.value.replace(/\D/g, ""))}
            onKeyDown={e => e.key === "Enter" && handleContinue()}
            className="w-full text-center text-4xl font-black tracking-widest bg-white/5 border border-white/10 focus:border-amber-500 focus:bg-white/10 rounded-lg px-6 py-6 text-white outline-none transition-all placeholder:text-white/20 shadow-inner"
            maxLength={10}
            autoFocus
          />
        </div>

        {error && (
          <p className="text-red-400 text-center text-sm font-bold bg-[#F40009]/10 border border-[#F40009]/20 rounded-lg px-4 py-4 uppercase tracking-wider">
            {error}
          </p>
        )}

        <button
          onClick={handleContinue}
          disabled={!empId.trim() || loading}
          className="w-full py-6 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-[#07090d] font-black text-xl transition-all shadow-lg shadow-black/30 flex items-center justify-center gap-3 uppercase tracking-widest"
        >
          {loading ? <Loader2 size={28} className="animate-spin" /> : "Validar Nómina"}
        </button>
      </div>

      <div className="relative z-10 w-full max-w-sm flex justify-center mt-4">
        <NumPad value={empId} onChange={setEmpId} onConfirm={handleContinue} />
      </div>
    </div>
  );
}

// ── Teclado numérico táctil ───────────────────────────────────────────────────
function NumPad({
  value, onChange, onConfirm,
}: { value: string; onChange: (v: string) => void; onConfirm: () => void }) {
  const keys = ["1","2","3","4","5","6","7","8","9","⌫","0","✓"];

  const press = (k: string) => {
    if (k === "⌫") onChange(value.slice(0, -1));
    else if (k === "✓") onConfirm();
    else if (value.length < 10) onChange(value + k);
  };

  return (
    <div className="grid grid-cols-3 gap-3 w-full">
      {keys.map(k => (
        <button
          key={k}
          onClick={() => press(k)}
          className={`h-16 rounded-lg text-2xl font-black transition-all active:scale-95 select-none
            ${k === "✓"
              ? "bg-amber-500 text-[#07090d] hover:bg-amber-400 shadow-lg shadow-black/20"
              : k === "⌫"
              ? "bg-[#F40009]/20 text-[#F40009] border border-[#F40009]/30 hover:bg-[#F40009]/30"
              : "bg-white/5 text-white hover:bg-white/10 border border-white/10 hover:border-white/20"
            }`}
        >
          {k}
        </button>
      ))}
    </div>
  );
}
