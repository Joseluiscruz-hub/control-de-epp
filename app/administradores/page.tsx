"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Factory, KeyRound, Loader2, RotateCcw, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/components/auth-provider";
import { auth } from "@/lib/firebase";
import { PLANTS, plantLabel, type PlantId } from "@/lib/plants";
import type { UserProfile } from "@/lib/admin-profile";

type RescueAction = "reset_mfa" | "revoke_sessions";
type PlantResetModule = "catalogos" | "alertas" | "inventario" | "empleados" | "presupuestos";

const PLANT_RESET_MODULES: Array<{ id: PlantResetModule; label: string; description: string }> = [
  { id: "catalogos", label: "Catalogos", description: "Materiales EPP y catalogo de kiosko." },
  { id: "alertas", label: "Alertas", description: "Alertas, solicitudes y estados de kiosko." },
  { id: "inventario", label: "Inventario", description: "Asignaciones, movimientos y cobros por extravio." },
  { id: "empleados", label: "Empleados", description: "Directorio, snapshots de kiosko y secretos de PIN." },
  { id: "presupuestos", label: "Presupuestos", description: "Metas y acumulados presupuestales." },
];

const CONFIRM_RESET_TEXT = "RESTABLECER";

function readProfile(id: string, data: Record<string, unknown>): UserProfile {
  const permissions = data.permissions && typeof data.permissions === "object" && !Array.isArray(data.permissions)
    ? data.permissions as Record<string, unknown>
    : {};
  return {
    uid: typeof data.uid === "string" && data.uid ? data.uid : id,
    email: typeof data.email === "string" ? data.email : "",
    role: data.role === "admin_local" ? "admin_local" : "admin_global",
    plantaId: data.plantaId === "toluca" || data.plantaId === "cuautitlan" ? data.plantaId : "nacional",
    displayName: typeof data.displayName === "string" ? data.displayName : undefined,
    employeeId: typeof data.employeeId === "string" && /^\d{1,12}$/.test(data.employeeId) ? data.employeeId : undefined,
    permissions: {
      ...(permissions.canApproveKioskRequests === true ? { canApproveKioskRequests: true } : {}),
      ...(permissions.canApproveKioskAlerts === true ? { canApproveKioskAlerts: true } : {}),
    },
    active: data.active !== false,
  };
}

function roleLabel(profile: UserProfile) {
  return profile.role === "admin_global" ? "Global" : "Local";
}

export default function AdministradoresPage() {
  const { isGlobalAdmin, profile } = useAuth();
  const [admins, setAdmins] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualUid, setManualUid] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [workingKey, setWorkingKey] = useState<string | null>(null);
  const [resettingEmployee, setResettingEmployee] = useState(false);
  const [employeeActivation, setEmployeeActivation] = useState<{ employeeId: string; code: string; expiresAt: number } | null>(null);
  const [plantResetOpen, setPlantResetOpen] = useState(false);
  const [plantResetPlant, setPlantResetPlant] = useState<PlantId>(PLANTS[0].id);
  const [plantResetModules, setPlantResetModules] = useState<PlantResetModule[]>([]);
  const [plantResetConfirm, setPlantResetConfirm] = useState("");
  const [plantResetting, setPlantResetting] = useState(false);

  useEffect(() => {
    if (!isGlobalAdmin) {
      const timeout = window.setTimeout(() => setLoading(false), 0);
      return () => window.clearTimeout(timeout);
    }

    let cancelled = false;
    const loadAdmins = async () => {
      setLoading(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("missing_session");
        const response = await fetch("/api/admin/users", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(typeof result?.error === "string" ? result.error : "admin_users_load_failed");
        }
        if (cancelled) return;
        setAdmins(Array.isArray(result?.users) ? result.users.map((user: UserProfile) => readProfile(user.uid, user as unknown as Record<string, unknown>)) : []);
        setLoading(false);
      } catch (error) {
        if (cancelled) return;
        console.error("[Admin users load error]", error);
        toast.error("No se pudo cargar el directorio de administradores.");
        setLoading(false);
      }
    };

    void loadAdmins();

    return () => {
      cancelled = true;
    };
  }, [isGlobalAdmin]);

  const sortedAdmins = useMemo(
    () => [...admins].sort((a, b) => a.email.localeCompare(b.email, "es")),
    [admins]
  );

  const rescue = useCallback(async (targetUid: string, action: RescueAction) => {
    const cleanUid = targetUid.trim();
    if (!cleanUid) return;

    setWorkingKey(`${cleanUid}:${action}`);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("missing_session");

      const response = await fetch("/api/admin/rescue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ targetUid: cleanUid, action }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result?.error === "string" ? result.error : "rescue_failed");
      }

      toast.success(action === "reset_mfa" ? "MFA liberado para el administrador." : "Sesiones revocadas.");
    } catch (error) {
      console.error("[Admin rescue UI error]", error);
      toast.error(error instanceof Error ? error.message : "No se pudo completar el rescate.");
    } finally {
      setWorkingKey(null);
    }
  }, []);

  const resetEmployeeCredential = useCallback(async () => {
    const cleanEmployeeId = employeeId.trim();
    if (!cleanEmployeeId) return;

    setResettingEmployee(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("missing_session");

      const response = await fetch("/api/admin/employee-credential-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ employeeId: cleanEmployeeId }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result?.error === "string" ? result.error : "employee_reset_failed");
      }

      if (typeof result?.activationCode !== "string" || !/^\d{8}$/.test(result.activationCode)) {
        throw new Error("El servidor no devolvio un codigo de activacion valido.");
      }
      setEmployeeActivation({ employeeId: cleanEmployeeId, code: result.activationCode, expiresAt: Number(result.activationExpiresAt) });
      toast.success("Acceso reseteado. Entrega el codigo temporal al colaborador.");
      setEmployeeId("");
    } catch (error) {
      console.error("[Employee credential reset UI error]", error);
      toast.error(error instanceof Error ? error.message : "No se pudo resetear el acceso del colaborador.");
    } finally {
      setResettingEmployee(false);
    }
  }, [employeeId]);

  const togglePlantResetModule = useCallback((moduleId: PlantResetModule, checked: boolean) => {
    setPlantResetModules((current) => {
      if (checked) return Array.from(new Set([...current, moduleId]));
      return current.filter((module) => module !== moduleId);
    });
  }, []);

  const executePlantReset = useCallback(async () => {
    if (plantResetModules.length === 0 || plantResetConfirm.trim().toUpperCase() !== CONFIRM_RESET_TEXT) return;

    setPlantResetting(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("missing_session");

      const response = await fetch("/api/admin/plant-reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          plantaId: plantResetPlant,
          modules: plantResetModules,
          confirmText: plantResetConfirm,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof result?.error === "string" ? result.error : "plant_reset_failed");
      }

      const totalDeleted = Number(result?.totalDeleted ?? 0);
      toast.success(`Restablecimiento completado. Documentos eliminados: ${totalDeleted}.`);
      setPlantResetOpen(false);
      setPlantResetModules([]);
      setPlantResetConfirm("");
    } catch (error) {
      console.error("[Plant reset UI error]", error);
      toast.error(error instanceof Error ? error.message : "No se pudo restablecer la planta.");
    } finally {
      setPlantResetting(false);
    }
  }, [plantResetConfirm, plantResetModules, plantResetPlant]);

  const allPlantResetModulesSelected = plantResetModules.length === PLANT_RESET_MODULES.length;
  const plantResetReady = plantResetModules.length > 0 && plantResetConfirm.trim().toUpperCase() === CONFIRM_RESET_TEXT;
  const employeeIdValid = /^\d{1,12}$/.test(employeeId.trim());

  if (!profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="enterprise-panel max-w-lg border-amber-400/20 bg-amber-500/10">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-300" />
            <h1 className="mt-4 text-2xl font-black text-white">Modulo administrativo restringido</h1>
            <p className="mt-3 text-sm font-semibold text-white/50">
              Tu perfil actual esta configurado como {profile ? roleLabel(profile) : "no disponible"}.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      <section className="enterprise-panel overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-white/10 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 text-red-200">
              <UserCog className="h-6 w-6" />
            </div>
            <div>
              <p className="section-eyebrow">{isGlobalAdmin ? "Administracion global" : "Administracion local"}</p>
              <h1 className="text-2xl font-black text-white">Rescate de Accesos</h1>
              <p className="mt-1 text-sm font-semibold text-white/45">
                Resetea el acceso de colaboradores y gestiona rescates administrativos autorizados.
              </p>
            </div>
          </div>
          <Badge className="h-9 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            {isGlobalAdmin ? "Admin global" : plantLabel(profile.plantaId)}
          </Badge>
        </div>

        <div className={`grid gap-6 p-5 ${isGlobalAdmin ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "xl:grid-cols-[minmax(0,560px)]"}`}>
          {isGlobalAdmin && (
            <Card className="enterprise-panel gap-0 py-0">
              <CardHeader className="border-b border-white/10 p-5">
                <CardTitle className="text-lg font-black text-white">Directorio de administradores</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex h-64 items-center justify-center">
                    <Loader2 className="h-7 w-7 animate-spin text-red-400" />
                  </div>
                ) : sortedAdmins.length === 0 ? (
                  <div className="flex h-64 items-center justify-center px-6 text-center text-sm font-semibold text-white/45">
                    Aun no hay documentos en la coleccion users.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full premium-table">
                      <thead>
                        <tr className="bg-white/[0.02]">
                          <th className="px-5 py-4 text-left text-[10px] font-black uppercase tracking-widest text-white/35">Cuenta</th>
                          <th className="py-4 text-left text-[10px] font-black uppercase tracking-widest text-white/35">Alcance</th>
                          <th className="py-4 text-right text-[10px] font-black uppercase tracking-widest text-white/35">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedAdmins.map((admin) => (
                          <tr key={admin.uid} className="border-b border-white/10 hover:bg-white/[0.03]">
                            <td className="px-5 py-4">
                              <p className="font-bold text-white">{admin.displayName || admin.email || admin.uid}</p>
                              <p className="mt-1 font-mono text-xs text-white/35">{admin.uid}</p>
                            </td>
                            <td className="py-4">
                              <div className="flex flex-wrap gap-2">
                                <Badge className="rounded-md border border-white/10 bg-white/5 text-white/60">
                                  {roleLabel(admin)}
                                </Badge>
                                <Badge className="rounded-md border border-white/10 bg-white/5 text-white/60">
                                  {plantLabel(admin.plantaId)}
                                </Badge>
                                {admin.employeeId && (
                                  <Badge className="rounded-md border border-white/10 bg-white/5 text-white/60">
                                    Nomina {admin.employeeId}
                                  </Badge>
                                )}
                                {admin.permissions?.canApproveKioskAlerts && (
                                  <Badge className="rounded-md border border-amber-400/25 bg-amber-400/10 text-amber-200">
                                    Aprueba alertas
                                  </Badge>
                                )}
                                {!admin.active && (
                                  <Badge className="rounded-md border border-red-400/25 bg-red-500/10 text-red-200">
                                    Inactivo
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="py-4 pr-5 text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  className="rounded-lg bg-[#F40009] text-white hover:bg-red-700"
                                  disabled={workingKey === `${admin.uid}:reset_mfa`}
                                  onClick={() => void rescue(admin.uid, "reset_mfa")}
                                >
                                  {workingKey === `${admin.uid}:reset_mfa` ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                                  MFA
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="rounded-lg border-white/10 bg-white/5 text-white hover:bg-white/10"
                                  disabled={workingKey === `${admin.uid}:revoke_sessions`}
                                  onClick={() => void rescue(admin.uid, "revoke_sessions")}
                                >
                                  {workingKey === `${admin.uid}:revoke_sessions` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                  Sesiones
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="space-y-6">
            <Card className="enterprise-panel gap-0 py-0">
              <CardHeader className="border-b border-white/10 p-5">
                <CardTitle className="text-lg font-black text-white">Reset de colaborador</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <Input
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value.replace(/\D/g, "").slice(0, 12))}
                  inputMode="numeric"
                  placeholder="Numero de socio"
                  className="h-11 rounded-lg border-white/10 bg-white/5 font-mono text-white placeholder:text-white/30"
                />
                <Button
                  className="h-11 rounded-lg bg-[#F40009] text-white hover:bg-red-700"
                  disabled={!employeeIdValid || resettingEmployee}
                  onClick={() => void resetEmployeeCredential()}
                >
                  {resettingEmployee ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Reset
                </Button>
                {employeeActivation && (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-center">
                    <p className="text-xs font-black uppercase tracking-widest text-amber-200">Codigo de un solo uso</p>
                    <p className="mt-2 font-mono text-3xl font-black tracking-[0.25em] text-white">{employeeActivation.code}</p>
                    <p className="mt-2 text-xs text-white/50">
                      Socio {employeeActivation.employeeId}. Expira {new Date(employeeActivation.expiresAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}. No se volvera a mostrar.
                    </p>
                    <Button type="button" variant="outline" className="mt-3 border-white/10 bg-white/5 text-white" onClick={() => setEmployeeActivation(null)}>
                      Ya lo entregue
                    </Button>
                  </div>
                )}
                <p className="text-xs font-semibold leading-relaxed text-white/40">
                  El reset invalida sesiones, borra el PIN y genera un codigo temporal de activacion. La accion queda auditada sin guardar el codigo en texto plano.
                </p>
              </CardContent>
            </Card>

            {isGlobalAdmin && (
              <Card className="enterprise-panel gap-0 py-0">
                <CardHeader className="border-b border-white/10 p-5">
                  <CardTitle className="text-lg font-black text-white">Rescate por UID</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <Input
                    value={manualUid}
                    onChange={(event) => setManualUid(event.target.value)}
                    placeholder="UID del administrador"
                    className="h-11 rounded-lg border-white/10 bg-white/5 font-mono text-white placeholder:text-white/30"
                  />
                  <div className="grid gap-2">
                    <Button
                      className="h-11 rounded-lg bg-[#F40009] text-white hover:bg-red-700"
                      disabled={!manualUid.trim() || workingKey === `${manualUid.trim()}:reset_mfa`}
                      onClick={() => void rescue(manualUid, "reset_mfa")}
                    >
                      <KeyRound className="h-4 w-4" />
                      Liberar MFA
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 rounded-lg border-white/10 bg-white/5 text-white hover:bg-white/10"
                      disabled={!manualUid.trim() || workingKey === `${manualUid.trim()}:revoke_sessions`}
                      onClick={() => void rescue(manualUid, "revoke_sessions")}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Revocar sesiones
                    </Button>
                  </div>
                  <p className="text-xs font-semibold leading-relaxed text-white/40">
                    Cada rescate queda registrado en admin_rescue_events con quien lo ejecuto y sobre que cuenta.
                  </p>
                </CardContent>
              </Card>
            )}

            {isGlobalAdmin && (
              <Card className="enterprise-panel gap-0 border-red-500/20 py-0">
                <CardHeader className="border-b border-red-500/20 p-5">
                  <CardTitle className="flex items-center gap-2 text-lg font-black text-white">
                    <Factory className="h-5 w-5 text-red-300" />
                    Restablecimiento de planta
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 p-5">
                  <p className="text-xs font-semibold leading-relaxed text-white/45">
                    Elimina informacion operativa de una planta. Solo una cuenta global puede ejecutar esta accion y queda auditada.
                  </p>
                  <Button
                    className="h-11 rounded-lg bg-red-600 text-white hover:bg-red-700"
                    onClick={() => setPlantResetOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Restablecer planta
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>

      {isGlobalAdmin && (
        <Dialog open={plantResetOpen} onOpenChange={setPlantResetOpen}>
          <DialogContent className="max-w-2xl border-red-500/20 bg-[#0b0d12] text-white">
            <DialogHeader>
              <DialogTitle className="text-xl font-black text-white">Restablecimiento de planta</DialogTitle>
              <DialogDescription className="text-white/50">
                Selecciona la planta y la informacion que se eliminara de forma permanente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <div className="grid gap-2">
                <Label className="text-xs font-black uppercase tracking-widest text-white/40">Planta</Label>
                <Select value={plantResetPlant} onValueChange={(value) => setPlantResetPlant(value as PlantId)}>
                  <SelectTrigger className="h-11 w-full border-white/10 bg-white/5 text-white">
                    <SelectValue>{plantLabel(plantResetPlant)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="border-white/10 bg-[#10151d] text-white">
                    {PLANTS.map((plant) => (
                      <SelectItem key={plant.id} value={plant.id}>{plant.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs font-black uppercase tracking-widest text-white/40">Informacion a eliminar</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-lg border-white/10 bg-white/5 text-white hover:bg-white/10"
                    onClick={() => setPlantResetModules(allPlantResetModulesSelected ? [] : PLANT_RESET_MODULES.map((module) => module.id))}
                  >
                    {allPlantResetModulesSelected ? "Limpiar todo" : "Todo"}
                  </Button>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {PLANT_RESET_MODULES.map((module) => {
                    const checked = plantResetModules.includes(module.id);
                    return (
                      <label
                        key={module.id}
                        className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                          checked ? "border-red-400/40 bg-red-500/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => togglePlantResetModule(module.id, event.target.checked)}
                          className="mt-1 h-4 w-4 accent-red-500"
                        />
                        <span>
                          <span className="block text-sm font-black text-white">{module.label}</span>
                          <span className="mt-1 block text-xs font-semibold leading-relaxed text-white/40">{module.description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-4">
                <p className="text-sm font-bold text-amber-100">
                  Para confirmar escribe <span className="font-mono text-white">{CONFIRM_RESET_TEXT}</span>.
                </p>
                <Input
                  value={plantResetConfirm}
                  onChange={(event) => setPlantResetConfirm(event.target.value)}
                  placeholder={CONFIRM_RESET_TEXT}
                  className="mt-3 h-11 rounded-lg border-white/10 bg-black/20 font-mono text-white placeholder:text-white/25"
                />
              </div>
            </div>

            <DialogFooter className="border-white/10 bg-white/[0.03]">
              <Button
                variant="outline"
                className="rounded-lg border-white/10 bg-white/5 text-white hover:bg-white/10"
                disabled={plantResetting}
                onClick={() => setPlantResetOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="rounded-lg bg-red-600 text-white hover:bg-red-700"
                disabled={!plantResetReady || plantResetting}
                onClick={() => void executePlantReset()}
              >
                {plantResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Eliminar informacion
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
