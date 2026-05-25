"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { validateEmployeePin } from "@/lib/kiosk-api";
import { setKioskSessionToken } from "@/lib/kiosk-session";
import { Lock, Loader2 } from "lucide-react";

export default function KioskoLoginPage() {
  const router = useRouter();
  const [employeeName] = useState(() =>
    typeof window === "undefined" ? "" : sessionStorage.getItem("kiosk_employee_name") ?? ""
  );
  const [employeeId] = useState(() =>
    typeof window === "undefined" ? "" : sessionStorage.getItem("kiosk_employee_id") ?? ""
  );
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const MAX_ATTEMPTS = 5;

  useEffect(() => {
    if (!employeeId) {
      router.push("/kiosko");
    }
  }, [employeeId, router]);

  const handleKey = async (k: string) => {
    if (loading || attempts >= MAX_ATTEMPTS) return;
    setError("");

    if (k === "⌫") { setPin(p => p.slice(0, -1)); return; }
    if (k === "✓") {
      if (pin.length < 6) { setError("Ingresa los 6 dígitos."); return; }
      setLoading(true);
      try {
        const result = await validateEmployeePin(employeeId, pin);
        if (result.valid && result.sessionToken) {
          setKioskSessionToken(result.sessionToken);
          router.push("/kiosko/catalogo");
        } else {
          const next = attempts + 1;
          setAttempts(next);
          setPin("");
          if (next >= MAX_ATTEMPTS) {
            setError("Demasiados intentos fallidos. Contacta a tu supervisor.");
          } else {
            setError(`PIN incorrecto. Te quedan ${MAX_ATTEMPTS - next} intento(s).`);
          }
        }
      } catch (error) {
        setPin("");
        setError(error instanceof Error ? error.message : "No se pudo validar el PIN.");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (pin.length < 6) setPin(p => p + k);
  };

  const keys = ["1","2","3","4","5","6","7","8","9","⌫","0","✓"];

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6 py-8 max-w-sm mx-auto w-full">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/30 flex items-center justify-center">
          <Lock size={32} className="text-amber-400" />
        </div>
        <h2 className="text-2xl font-bold">Ingresa tu PIN</h2>
        <p className="text-gray-400">
          Hola <span className="text-white font-semibold">{employeeName}</span>
        </p>
      </div>

      {/* Dots */}
      <div className="flex gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full border-2 transition-all ${
              i < pin.length
                ? "bg-amber-400 border-amber-400 scale-110"
                : "border-gray-600"
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-center text-sm bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-3 w-full">
          {error}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 w-full">
        {keys.map(k => (
          <button
            key={k}
            onClick={() => handleKey(k)}
            disabled={loading || attempts >= MAX_ATTEMPTS}
            className={`h-16 rounded-xl text-2xl font-bold transition-all active:scale-95 select-none
              ${k === "✓"
                ? "bg-amber-400 text-gray-900 hover:bg-amber-300"
                : k === "⌫"
                ? "bg-gray-700 text-gray-200 hover:bg-gray-600"
                : "bg-gray-800 text-white hover:bg-gray-700 border border-gray-700"
              } disabled:opacity-30`}
          >
            {loading && k === "✓" ? <Loader2 className="animate-spin mx-auto" size={22} /> : k}
          </button>
        ))}
      </div>

      <button
        onClick={() => router.push("/kiosko")}
        className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        ← No soy yo
      </button>
    </div>
  );
}
