"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveEmployeePin } from "@/lib/kiosk-api";
import { Shield, Check, ChevronDown, Loader2 } from "lucide-react";

const TERMS_TEXT = `
TÉRMINOS Y CONDICIONES DE USO DE EQUIPO DE PROTECCIÓN PERSONAL

1. RESPONSABILIDAD DEL EMPLEADO
El empleado es responsable del uso, cuidado y resguardo del EPP asignado durante la vigencia establecida en este sistema.

2. REPOSICIÓN POR VIDA ÚTIL
Cuando el EPP haya cumplido su período de vida útil definido por la empresa, el empleado tendrá derecho a solicitar reposición sin costo alguno.

3. REPOSICIÓN POR DESGASTE
En caso de desgaste prematuro, el empleado deberá presentar evidencia fotográfica del daño. La reposición estará sujeta a revisión y aprobación del supervisor de área.

4. PÉRDIDA O EXTRAVÍO
Si el empleado extravía el EPP antes de que concluya su vida útil, se aplicará un cargo proporcional al tiempo restante de uso. Dicho cargo será descontado de la nómina conforme a la NOM-017-STPS.

5. CUMPLIMIENTO NORMATIVO
Este sistema opera bajo las disposiciones de la Secretaría del Trabajo y Previsión Social (STPS) y las normas NOM-017-STPS y NOM-030-STPS vigentes.

6. PROTECCIÓN DE DATOS
Los datos personales del empleado serán tratados conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).

Al aceptar estos términos, el empleado reconoce haber leído, entendido y aceptado todas las condiciones aquí descritas.
`.trim();

function hashPin(pin: string): string {
  // Simulación de hash — en producción usar API Route con bcrypt
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    hash = (hash << 5) - hash + pin.charCodeAt(i);
    hash |= 0;
  }
  return "pin_" + Math.abs(hash).toString(36) + "_" + pin.length;
}

export default function KioskoSetupPage() {
  const router = useRouter();
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [step, setStep] = useState<"terms" | "pin">("terms");
  const [termsScrolled, setTermsScrolled] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const name = sessionStorage.getItem("kiosk_employee_name") ?? "";
    const id = sessionStorage.getItem("kiosk_employee_id") ?? "";
    if (!id) { router.push("/kiosko"); return; }
    setEmployeeName(name);
    setEmployeeId(id);
  }, []);

  const handleTermsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      setTermsScrolled(true);
    }
  };

  const handlePinKey = (k: string) => {
    const target = pinStep === "enter" ? pin : pinConfirm;
    const setter = pinStep === "enter" ? setPin : setPinConfirm;
    setError("");
    if (k === "⌫") { setter(target.slice(0, -1)); return; }
    if (k === "✓") {
      if (pinStep === "enter") {
        if (target.length < 6) { setError("El PIN debe tener 6 dígitos."); return; }
        setPinStep("confirm");
      } else {
        if (target.length < 6) { setError("Confirma los 6 dígitos."); return; }
        if (pin !== pinConfirm) { setError("Los PINs no coinciden. Intenta de nuevo."); setPinConfirm(""); return; }
        handleSave();
      }
      return;
    }
    if (target.length < 6) setter(target + k);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const hash = hashPin(pin);
      await saveEmployeePin(employeeId, hash);
      sessionStorage.setItem("kiosk_pin_verified", "true");
      router.push("/kiosko/catalogo");
    } catch (e) {
      setError("Error al guardar. Intenta de nuevo.");
      setLoading(false);
    }
  };

  const keys = ["1","2","3","4","5","6","7","8","9","⌫","0","✓"];
  const currentPin = pinStep === "enter" ? pin : pinConfirm;

  if (step === "terms") {
    return (
      <div className="flex-1 flex flex-col items-center px-6 py-8 gap-6 max-w-xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <Shield size={28} className="text-amber-400" />
          <h2 className="text-2xl font-bold">Términos y Condiciones</h2>
        </div>
        <p className="text-gray-400 text-center">
          Hola <span className="text-white font-semibold">{employeeName}</span>, es tu primer acceso. Lee y acepta los términos para continuar.
        </p>

        <div
          onScroll={handleTermsScroll}
          className="flex-1 w-full bg-gray-800 rounded-2xl p-5 overflow-y-auto text-sm text-gray-300 leading-relaxed border border-gray-700 max-h-72"
          style={{ scrollbarWidth: "thin" }}
        >
          <pre className="whitespace-pre-wrap font-sans">{TERMS_TEXT}</pre>
          {!termsScrolled && (
            <div className="sticky bottom-0 flex justify-center pt-3">
              <span className="flex items-center gap-1 text-amber-400 text-xs animate-bounce">
                <ChevronDown size={14} /> Desplázate para leer todo
              </span>
            </div>
          )}
        </div>

        <label className={`flex items-center gap-3 cursor-pointer ${!termsScrolled ? "opacity-40" : ""}`}>
          <input
            type="checkbox"
            disabled={!termsScrolled}
            checked={termsAccepted}
            onChange={e => setTermsAccepted(e.target.checked)}
            className="w-6 h-6 accent-amber-400"
          />
          <span className="text-base">Acepto los términos y condiciones</span>
        </label>

        <button
          disabled={!termsAccepted}
          onClick={() => setStep("pin")}
          className="w-full py-5 rounded-2xl bg-amber-400 hover:bg-amber-300 active:bg-amber-500 disabled:opacity-30 text-gray-900 font-bold text-xl transition-colors"
        >
          Aceptar y Crear PIN →
        </button>
      </div>
    );
  }

  // PIN step
  return (
    <div className="flex-1 flex flex-col items-center px-6 py-8 gap-6 max-w-sm mx-auto w-full">
      <h2 className="text-2xl font-bold">
        {pinStep === "enter" ? "Crea tu PIN de 6 dígitos" : "Confirma tu PIN"}
      </h2>
      <p className="text-gray-400 text-center text-base">
        {pinStep === "enter"
          ? "Este PIN lo usarás cada vez que solicites EPP en este kiosko."
          : "Ingresa el mismo PIN para confirmar."}
      </p>

      {/* Dots */}
      <div className="flex gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full border-2 transition-all ${
              i < currentPin.length
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
            onClick={() => handlePinKey(k)}
            disabled={loading}
            className={`h-16 rounded-xl text-2xl font-bold transition-all active:scale-95 select-none
              ${k === "✓"
                ? "bg-amber-400 text-gray-900 hover:bg-amber-300"
                : k === "⌫"
                ? "bg-gray-700 text-gray-200 hover:bg-gray-600"
                : "bg-gray-800 text-white hover:bg-gray-700 border border-gray-700"
              }`}
          >
            {loading && k === "✓" ? <Loader2 className="animate-spin mx-auto" size={22} /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
