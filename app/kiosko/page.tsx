"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { getEmployeeById } from "@/lib/kiosk-api";
import { Loader2, HardHat } from "lucide-react";
import { clearKioskSession } from "@/lib/kiosk-session";
import { useKioskInactivityTimeout } from "@/hooks/use-kiosk-inactivity-timeout";

function getKioskConnectionErrorMessage(error: unknown) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";

  if (code === "permission-denied") {
    return "El kiosko no tiene permisos en Firebase. Despliega firestore.rules y sincroniza el empleado desde el panel de Empleados.";
  }

  if (code === "unavailable") {
    return "No hay conexión con Firebase. Revisa internet o intenta de nuevo.";
  }

  return "Error de conexión. Intenta de nuevo.";
}

export default function KioskoHomePage() {
  const router = useRouter();
  const [empId, setEmpId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleTimeout = useCallback(() => {
    clearKioskSession();
    setEmpId("");
    setError("");
    router.replace("/kiosko");
  }, [router]);

  useKioskInactivityTimeout({
    timeoutMs: 2 * 60 * 1000,
    onTimeout: handleTimeout,
  });

  const handleContinue = async () => {
    if (!empId.trim()) return;
    setLoading(true);
    setError("");
    try {
      const emp = await getEmployeeById(empId.trim());
      if (!emp) {
        setError("Número de empleado no encontrado. Verifica con tu supervisor.");
        setLoading(false);
        return;
      }
      if (!emp.active) {
        setError("Este empleado está inactivo. Contacta a Recursos Humanos.");
        setLoading(false);
        return;
      }

      clearKioskSession();
      sessionStorage.setItem("kiosk_employee_id", emp.id);
      sessionStorage.setItem("kiosk_employee_name", emp.name);
      sessionStorage.setItem("kiosk_first_login", String(Boolean(emp.firstLogin)));
      sessionStorage.setItem("kiosk_terms_accepted", String(Boolean(emp.termsAccepted)));

      // 1. Si es un empleado nuevo, lo mandamos a que lea los términos y cree su PIN
      if (emp.firstLogin || !emp.termsAccepted) {
        router.push("/kiosko/setup");
        return;
      }

      // 2. Si ya es un empleado registrado, lo mandamos a la pantalla de LOGIN a que ponga su PIN
      router.push("/kiosko/login");
    } catch (error) {
      console.error("[Kiosko employee lookup error]", error);
      setError(getKioskConnectionErrorMessage(error));
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-10 px-8 py-16">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-20 h-20 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
          <HardHat size={44} className="text-amber-400" />
        </div>
        <h1 className="text-3xl font-bold text-white">Solicitud de EPP</h1>
        <p className="text-gray-400 max-w-sm text-lg">
          Ingresa tu número de empleado para comenzar
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-4">
        <input
          type="tel"
          inputMode="numeric"
          placeholder="Ej. 1881"
          value={empId}
          onChange={e => setEmpId(e.target.value.replace(/\D/g, ""))}
          onKeyDown={e => e.key === "Enter" && handleContinue()}
          className="w-full text-center text-3xl font-bold tracking-widest bg-gray-800 border-2 border-gray-600 focus:border-amber-400 rounded-2xl px-6 py-5 text-white outline-none transition-colors placeholder:text-gray-600"
          maxLength={10}
          autoFocus
        />

        {error && (
          <p className="text-red-400 text-center text-base bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <button
          onClick={handleContinue}
          disabled={!empId.trim() || loading}
          className="w-full py-5 rounded-2xl bg-amber-400 hover:bg-amber-300 active:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-gray-900 font-bold text-xl transition-colors flex items-center justify-center gap-3"
        >
          {loading ? <Loader2 size={24} className="animate-spin" /> : "Continuar →"}
        </button>
      </div>

      {/* Teclado numérico visual táctil */}
      <NumPad value={empId} onChange={setEmpId} onConfirm={handleContinue} />
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
    <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
      {keys.map(k => (
        <button
          key={k}
          onClick={() => press(k)}
          className={`h-16 rounded-xl text-2xl font-bold transition-all active:scale-95 select-none
            ${k === "✓"
              ? "bg-amber-400 text-gray-900 hover:bg-amber-300"
              : k === "⌫"
              ? "bg-gray-700 text-gray-200 hover:bg-gray-600"
              : "bg-gray-800 text-white hover:bg-gray-700 border border-gray-700"
            }`}
        >
          {k}
        </button>
      ))}
    </div>
  );
}
