"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Clipboard, Database, ExternalLink, KeyRound, Loader2, RefreshCw, ShieldAlert, Terminal, XCircle, Zap } from "lucide-react";
import { useAuth } from "./auth-provider";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

const DEVELOPER_EMAILS = (process.env.NEXT_PUBLIC_DEVELOPER_EMAILS || "mimonkb222@gmail.com")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

type MaskedValue = {
  configured: boolean;
  value: string;
};

type DeveloperConfig = {
  user: {
    uid: string;
    email: string;
    isDeveloper: boolean;
    isServerAdmin: boolean;
  };
  firebase: {
    projectId: string;
    databaseId: string;
    authDomain: string;
    storageBucket: string;
    messagingSenderId: MaskedValue;
    appId: MaskedValue;
    apiKey: MaskedValue;
  };
  permissions: {
    publicAdminEmails: string[];
    serverAdminEmails: string[];
    developerEmails: string[];
    missingAdminsInRules: string[];
  };
  runtime: {
    nodeEnv: string;
    googleCloudProject: string;
    service: string;
    revision: string;
    region: string;
  };
  secrets: {
    kioskSessionSecret: {
      configured: boolean;
      lengthOk: boolean;
      length: number;
    };
    geminiApiKey: {
      configured: boolean;
    };
    firebaseServiceAccountJson: {
      configured: boolean;
    };
  };
  rules: {
    available: boolean;
    path: string;
    content: string;
    bytes: number;
    updatedAt: string | null;
    hasLockedKioskRequests: boolean;
    hasLockedPinAttempts: boolean;
  };
  links: {
    firebaseRules: string;
    githubActions: string;
    githubSecrets: string;
  };
};

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-black uppercase tracking-wider ${
        ok
          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
          : "border-red-400/25 bg-red-500/10 text-red-300"
      }`}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-white/35">{label}</p>
      <p className="mt-1 truncate font-mono text-xs text-white/80">{value || "No configurado"}</p>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-white">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-amber-300">
        {icon}
      </span>
      <h3 className="text-sm font-black uppercase tracking-widest">{title}</h3>
    </div>
  );
}

export function DeveloperModeDialog({ mobile = false }: { mobile?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<DeveloperConfig | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const isDeveloper = Boolean(user?.email && DEVELOPER_EMAILS.includes(user.email.toLowerCase()));

  const warnings = useMemo(() => {
    if (!config) return [];
    const next: string[] = [];
    if (!config.secrets.kioskSessionSecret.lengthOk) next.push("KIOSK_SESSION_SECRET no cumple mínimo de 32 caracteres.");
    if (config.permissions.missingAdminsInRules.length > 0) {
      next.push(`Faltan admins en firestore.rules: ${config.permissions.missingAdminsInRules.join(", ")}.`);
    }
    if (!config.rules.available) next.push("No se pudo leer firestore.rules desde el servidor.");
    if (!config.rules.hasLockedKioskRequests) next.push("kiosk_requests permite escritura directa o no se pudo validar el bloqueo.");
    if (!config.rules.hasLockedPinAttempts) next.push("kiosk_pin_attempts no está bloqueado para cliente.");
    return next;
  }, [config]);

  const loadConfig = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/developer/config", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "No se pudo cargar configuración.");
      }
      setConfig(data as DeveloperConfig);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar configuración.");
    } finally {
      setLoading(false);
    }
  };

  const copyRules = async () => {
    if (!config?.rules.content) return;
    await navigator.clipboard.writeText(config.rules.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (!isDeveloper) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size={mobile ? "default" : "sm"}
        onClick={() => {
          setOpen(true);
          if (!config && !loading) void loadConfig();
        }}
        className={
          mobile
            ? "w-full justify-start gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-amber-300 hover:bg-amber-500/10"
            : "hidden md:flex items-center gap-1.5 rounded-lg text-xs font-semibold text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
        }
      >
        <Zap className="h-3.5 w-3.5" />
        Modo Dev
      </Button>

      <DialogContent className="max-h-[88vh] overflow-hidden rounded-xl border border-white/10 bg-[#07090d] p-0 text-white shadow-2xl sm:max-w-5xl">
        <div className="border-b border-white/10 bg-white/[0.055] p-6">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Modo Desarrollador</DialogTitle>
            <p className="text-sm font-medium text-white/50">{user?.email}</p>
          </DialogHeader>
        </div>

        <div className="max-h-[calc(88vh-92px)] overflow-y-auto p-6">
          {loading && (
            <div className="flex min-h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-amber-300" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-400/25 bg-red-500/10 p-4 text-sm font-semibold text-red-200">
              {error}
            </div>
          )}

          {!loading && config && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <StatusPill ok={config.user.isDeveloper} label="Owner" />
                  <StatusPill ok={config.user.isServerAdmin} label="Admin Rules" />
                  <StatusPill ok={warnings.length === 0} label={warnings.length === 0 ? "Sin alertas" : `${warnings.length} alertas`} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => void loadConfig()} className="gap-2 text-white/55 hover:bg-white/10 hover:text-white">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Actualizar
                </Button>
              </div>

              {warnings.length > 0 && (
                <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-amber-200">
                    <ShieldAlert className="h-4 w-4" />
                    Alertas
                  </div>
                  <div className="space-y-1 text-sm font-medium text-amber-100/80">
                    {warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                </div>
              )}

              <section className="space-y-3">
                <SectionTitle icon={<Database className="h-4 w-4" />} title="Firebase" />
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Project ID" value={config.firebase.projectId} />
                  <Field label="Database ID" value={config.firebase.databaseId} />
                  <Field label="Auth Domain" value={config.firebase.authDomain} />
                  <Field label="Storage Bucket" value={config.firebase.storageBucket} />
                  <Field label="App ID" value={config.firebase.appId.value} />
                  <Field label="API Key" value={config.firebase.apiKey.value} />
                </div>
              </section>

              <section className="space-y-3">
                <SectionTitle icon={<KeyRound className="h-4 w-4" />} title="Permisos" />
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Admins UI" value={config.permissions.publicAdminEmails.join(", ")} />
                  <Field label="Admins Server" value={config.permissions.serverAdminEmails.join(", ")} />
                  <Field label="Developer Owners" value={config.permissions.developerEmails.join(", ")} />
                  <Field label="Faltantes en Rules" value={config.permissions.missingAdminsInRules.join(", ") || "Ninguno"} />
                </div>
              </section>

              <section className="space-y-3">
                <SectionTitle icon={<Terminal className="h-4 w-4" />} title="Runtime" />
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="NODE_ENV" value={config.runtime.nodeEnv} />
                  <Field label="Cloud Project" value={config.runtime.googleCloudProject} />
                  <Field label="Cloud Run Service" value={config.runtime.service} />
                  <Field label="Revision" value={config.runtime.revision} />
                  <Field label="Region" value={config.runtime.region} />
                  <Field label="Rules bytes" value={String(config.rules.bytes)} />
                </div>
              </section>

              <section className="space-y-3">
                <SectionTitle icon={<ShieldAlert className="h-4 w-4" />} title="Secrets y reglas" />
                <div className="flex flex-wrap gap-2">
                  <StatusPill ok={config.secrets.kioskSessionSecret.lengthOk} label="Kiosk Secret" />
                  <StatusPill ok={config.secrets.geminiApiKey.configured} label="Gemini" />
                  <StatusPill ok={config.rules.hasLockedKioskRequests} label="Requests locked" />
                  <StatusPill ok={config.rules.hasLockedPinAttempts} label="PIN attempts locked" />
                </div>
                <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3">
                    <span className="font-mono text-xs text-white/55">{config.rules.path}</span>
                    <Button variant="ghost" size="sm" onClick={copyRules} disabled={!config.rules.content} className="gap-2 text-white/55 hover:bg-white/10 hover:text-white">
                      <Clipboard className="h-3.5 w-3.5" />
                      {copied ? "Copiado" : "Copiar reglas"}
                    </Button>
                  </div>
                  <pre className="max-h-72 overflow-auto p-4 text-xs leading-relaxed text-white/70">
                    {config.rules.content || "firestore.rules no disponible en este runtime."}
                  </pre>
                </div>
              </section>

              <div className="flex flex-wrap gap-3 border-t border-white/10 pt-2">
                {config.links.firebaseRules && (
                  <a href={config.links.firebaseRules} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white/55 hover:bg-white/10 hover:text-white">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Firebase Rules
                  </a>
                )}
                <a href={config.links.githubActions} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white/55 hover:bg-white/10 hover:text-white">
                  <ExternalLink className="h-3.5 w-3.5" />
                  GitHub Actions
                </a>
                <a href={config.links.githubSecrets} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white/55 hover:bg-white/10 hover:text-white">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Secrets
                </a>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
