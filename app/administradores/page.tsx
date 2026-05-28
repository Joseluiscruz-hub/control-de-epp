"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { AlertTriangle, KeyRound, Loader2, RotateCcw, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-provider";
import { auth, db } from "@/lib/firebase";
import { plantLabel } from "@/lib/plants";
import type { UserProfile } from "@/lib/admin-profile";

type RescueAction = "reset_mfa" | "revoke_sessions";

function readProfile(id: string, data: Record<string, unknown>): UserProfile {
  return {
    uid: typeof data.uid === "string" && data.uid ? data.uid : id,
    email: typeof data.email === "string" ? data.email : "",
    role: data.role === "admin_local" ? "admin_local" : "admin_global",
    plantaId: data.plantaId === "toluca" || data.plantaId === "cuautitlan" ? data.plantaId : "nacional",
    displayName: typeof data.displayName === "string" ? data.displayName : undefined,
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
  const [workingKey, setWorkingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isGlobalAdmin) {
      const timeout = window.setTimeout(() => setLoading(false), 0);
      return () => window.clearTimeout(timeout);
    }

    const unsubscribe = onSnapshot(
      query(collection(db, "users")),
      (snapshot) => {
        setAdmins(snapshot.docs.map((docSnap) => readProfile(docSnap.id, docSnap.data())));
        setLoading(false);
      },
      (error) => {
        console.error("[Admin users load error]", error);
        toast.error("No se pudo cargar el directorio de administradores.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
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

  if (!isGlobalAdmin) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="enterprise-panel max-w-lg border-amber-400/20 bg-amber-500/10">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-300" />
            <h1 className="mt-4 text-2xl font-black text-white">Modulo global restringido</h1>
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
              <p className="section-eyebrow">Administracion global</p>
              <h1 className="text-2xl font-black text-white">Rescate de Accesos</h1>
              <p className="mt-1 text-sm font-semibold text-white/45">
                Libera MFA o revoca sesiones de administradores locales.
              </p>
            </div>
          </div>
          <Badge className="h-9 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin global
          </Badge>
        </div>

        <div className="grid gap-6 p-5 xl:grid-cols-[minmax(0,1fr)_360px]">
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
        </div>
      </section>
    </div>
  );
}
