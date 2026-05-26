"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createKioskRequest, getPPECatalog } from "@/lib/kiosk-api";
import { KioskRequestItem, PPECatalogItem, ReplacementReason } from "@/lib/kiosk-types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, DollarSign, Footprints, Glasses, Hand, HardHat, Headphones, Loader2, Package, Search, Shirt, Wind } from "lucide-react";
import { clearKioskSession } from "@/lib/kiosk-session";
import { useKioskInactivityTimeout } from "@/hooks/use-kiosk-inactivity-timeout";

const CATEGORY_ICONS: Record<string, ReactNode> = {
  Guantes: <Hand className="h-5 w-5" />,
  Cascos: <HardHat className="h-5 w-5" />,
  Gafas: <Glasses className="h-5 w-5" />,
  Calzado: <Footprints className="h-5 w-5" />,
  "Proteccion Auditiva": <Headphones className="h-5 w-5" />,
  Ropa: <Shirt className="h-5 w-5" />,
  Respiradores: <Wind className="h-5 w-5" />,
  Otros: <Package className="h-5 w-5" />,
};

const CATEGORIES = ["Todos", "Guantes", "Cascos", "Gafas", "Calzado", "Proteccion Auditiva", "Ropa", "Respiradores", "Otros"];

const REQUEST_REASONS: Record<ReplacementReason, { label: string; desc: string; icon: ReactNode; tone: string }> = {
  desgaste: {
    label: "Uso normal",
    desc: "El EPP se cambió por desgaste de trabajo. Se atenderá sin problema.",
    icon: <AlertTriangle className="h-5 w-5" />,
    tone: "border-amber-400/35 bg-amber-400/10 text-amber-200",
  },
  vida_util: {
    label: "Vida útil cumplida",
    desc: "El EPP ya completó su periodo de uso. Se atenderá sin problema.",
    icon: <CheckCircle2 className="h-5 w-5" />,
    tone: "border-emerald-400/35 bg-emerald-400/10 text-emerald-200",
  },
  extravio: {
    label: "Pérdida, robo o mal uso",
    desc: "La reposición se cobrará por nómina conforme al costo aplicable.",
    icon: <DollarSign className="h-5 w-5" />,
    tone: "border-red-400/40 bg-red-500/10 text-red-200",
  },
};

type SelectedVariant = {
  itemId: string;
  itemName: string;
  sku: string;
  size: string;
  replacementDays: number;
};

export default function KioskoCatalogoPage() {
  const router = useRouter();
  const [items, setItems] = useState<PPECatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [submitError, setSubmitError] = useState("");
  const [reasonDialogOpen, setReasonDialogOpen] = useState(false);
  const [requestReason, setRequestReason] = useState<ReplacementReason | null>(null);
  const [employeeName] = useState(() =>
    typeof window === "undefined" ? "" : sessionStorage.getItem("kiosk_employee_name") ?? ""
  );
  const [employeeId] = useState(() =>
    typeof window === "undefined" ? "" : sessionStorage.getItem("kiosk_employee_id") ?? ""
  );
  const [selectedByItem, setSelectedByItem] = useState<Record<string, SelectedVariant>>({});
  const [sizeByItem, setSizeByItem] = useState<Record<string, string>>({});
  const selectedCount = Object.keys(selectedByItem).length;

  const returnToLogin = useCallback(() => {
    clearKioskSession();
    router.replace("/kiosko");
  }, [router]);

  useKioskInactivityTimeout({
    timeoutMs: 2 * 60 * 1000,
    onTimeout: returnToLogin,
  });

  useEffect(() => {
    const verified = sessionStorage.getItem("kiosk_pin_verified");
    if (!employeeId || verified !== "true") {
      router.replace("/kiosko");
      return;
    }

    let cancelled = false;

    void getPPECatalog().then((data) => {
      if (cancelled) return;
      setItems(data);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [employeeId, router]);

  const isItemAvailable = (item: PPECatalogItem): boolean => {
    if (item.hasSizes && item.sizes) {
      return Object.values(item.sizes).some((variant) => variant.available === true || (variant.stock ?? 0) > 0);
    }
    return item.available === true || (item.stock ?? 0) > 0;
  };

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const matchCat = category === "Todos" || item.category === category;
        const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
        return matchCat && matchSearch;
      }),
    [items, category, search]
  );

  const toggleSelection = (item: PPECatalogItem) => {
    const size = item.hasSizes ? sizeByItem[item.id] : "N/A";
    if (item.hasSizes && !size) return;
    if (item.hasSizes && (!item.sizes || !item.sizes[size])) return;

    const sku = item.hasSizes ? item.sizes?.[size]?.sku : item.sku;
    if (!sku) return;

    setSelectedByItem((prev) => {
      if (prev[item.id]?.sku === sku && prev[item.id]?.size === size) {
        const copy = { ...prev };
        delete copy[item.id];
        return copy;
      }

      return {
        ...prev,
        [item.id]: {
          itemId: item.id,
          itemName: item.name,
          sku,
          size,
          replacementDays: item.replacementDays,
        },
      };
    });
  };

  const submitRequest = async (reasonOverride?: ReplacementReason) => {
    const selectedItems = Object.values(selectedByItem);
    if (!employeeId || selectedItems.length === 0) return;
    const reasonToUse = reasonOverride ?? requestReason;

    if (!reasonToUse) {
      setReasonDialogOpen(true);
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    setReasonDialogOpen(false);
    try {
      const requestId = await createKioskRequest({
        employeeId,
        employeeName,
        items: selectedItems.map((item) => ({
          ...item,
          replacementReason: reasonToUse,
        })) as KioskRequestItem[],
      });
      sessionStorage.setItem("kiosk_request_id", requestId);
      router.push("/kiosko/espera");
    } catch {
      setSubmitError("No se pudo enviar la solicitud. Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-0 pb-32">
      <div className="px-6 pt-6 pb-4 border-b border-white/10 bg-white/[0.025]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Selecciona tu EPP</h2>
            <p className="text-sm text-gray-400">{employeeName} — Puedes elegir uno o varios</p>
          </div>
          <button
            onClick={returnToLogin}
            className="text-sm text-gray-400 hover:text-red-400 transition-colors border border-white/10 rounded-lg px-3 py-2"
          >
            Cancelar
          </button>
        </div>

        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar EPP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 focus:border-amber-400 rounded-lg pl-11 pr-4 py-3 text-base text-white outline-none transition-colors placeholder:text-gray-600"
          />
        </div>

        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2 ${
                category === cat ? "bg-amber-400 text-gray-900" : "bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10"
              }`}
            >
              {cat !== "Todos" && CATEGORY_ICONS[cat]} {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array(6)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="h-52 rounded-lg bg-white/5 animate-pulse" />
              ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-gray-500">
            <Package size={48} />
            <p className="text-lg">Sin resultados para &quot;{search}&quot;</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((item) => {
              const status = isItemAvailable(item) ? "ok" : "empty";
              const selected = !!selectedByItem[item.id];
              const selectedSize = sizeByItem[item.id];

              return (
                <div
                  key={item.id}
                  className={`relative flex flex-col gap-3 p-4 rounded-lg border transition-all
                    ${
                      status === "empty"
                        ? "border-white/10 bg-white/5 opacity-50"
                        : selected
                        ? "border-amber-400 bg-amber-400/10"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                >
                  <span className="h-11 w-11 rounded-lg border border-white/10 bg-white/5 text-amber-300 flex items-center justify-center">
                    {CATEGORY_ICONS[item.category] ?? <Package className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className="font-semibold text-white text-base leading-tight">{item.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{item.category}</p>
                  </div>

                  {item.hasSizes && item.sizes && status !== "empty" && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(item.sizes)
                        .filter(([, variant]) => variant.available === true || (variant.stock ?? 0) > 0)
                        .map(([size]) => (
                          <button
                            key={size}
                            onClick={() => {
                              setSizeByItem((prev) => ({ ...prev, [item.id]: size }));
                              setSelectedByItem((prev) => {
                                const current = prev[item.id];
                                if (!current || !item.sizes?.[size]) return prev;
                                return {
                                  ...prev,
                                  [item.id]: {
                                    ...current,
                                    size,
                                    sku: item.sizes[size].sku,
                                  },
                                };
                              });
                            }}
                            className={`px-3 py-1 rounded-lg text-sm border ${
                              selectedSize === size
                                ? "border-amber-400 bg-amber-400/15 text-amber-300"
                                : "border-gray-600 text-gray-300"
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                    </div>
                  )}

                  <button
                    onClick={() => status !== "empty" && toggleSelection(item)}
                    disabled={status === "empty" || (item.hasSizes && !selectedSize)}
                    className={`mt-auto w-full py-3 rounded-lg font-semibold transition-colors ${
                      selected
                        ? "bg-green-500/20 text-green-300 border border-green-500/40"
                        : "bg-amber-400 text-gray-900 hover:bg-amber-300 disabled:opacity-40"
                    }`}
                  >
                    {selected ? "Seleccionado" : "Seleccionar"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-[#07090d]/95 backdrop-blur border-t border-white/10 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <p className="text-sm text-gray-400">
            Seleccionados: <span className="text-white font-bold">{selectedCount}</span>
            </p>
            {submitError && <p className="text-xs text-red-400 mt-1">{submitError}</p>}
          </div>
          <button
            onClick={() => void submitRequest()}
            disabled={submitting || selectedCount === 0}
            className="px-8 py-4 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-gray-900 font-bold text-lg flex items-center gap-2"
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            Solicitar
          </button>
        </div>
      </div>

      <Dialog open={reasonDialogOpen} onOpenChange={setReasonDialogOpen}>
        <DialogContent className="sm:max-w-2xl rounded-xl border border-white/10 bg-[#07090d] p-0 text-white shadow-2xl">
          <div className="border-b border-white/10 bg-white/[0.055] p-6">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight">Motivo del cambio</DialogTitle>
              <p className="text-sm font-medium text-white/55">
                Selecciona por qué estás cambiando tu EPP antes de enviar la solicitud.
              </p>
            </DialogHeader>
          </div>

          <div className="space-y-4 p-6">
            <div className="grid gap-3">
              {(Object.entries(REQUEST_REASONS) as [ReplacementReason, typeof REQUEST_REASONS[ReplacementReason]][]).map(([key, option]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRequestReason(key)}
                  className={`flex items-start gap-4 rounded-lg border p-4 text-left transition-all ${
                    requestReason === key
                      ? option.tone
                      : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/25 hover:bg-white/[0.06]"
                  }`}
                >
                  <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
                    requestReason === key ? "border-current bg-black/15" : "border-white/10 bg-white/5"
                  }`}>
                    {option.icon}
                  </span>
                  <span>
                    <span className="block text-base font-black uppercase tracking-wide">{option.label}</span>
                    <span className="mt-1 block text-sm font-medium opacity-75">{option.desc}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-red-400/25 bg-red-500/10 p-4 text-sm font-semibold leading-relaxed text-red-100">
              Si el EPP se pierde, se lo roban o se usa de forma incorrecta, la reposición será cobrada al colaborador por nómina.
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setReasonDialogOpen(false)}
                disabled={submitting}
                className="rounded-lg border border-white/10 px-5 py-3 text-sm font-bold text-white/55 transition-colors hover:bg-white/10 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => requestReason && void submitRequest(requestReason)}
                disabled={!requestReason || submitting}
                className="rounded-lg bg-amber-400 px-6 py-3 text-sm font-black uppercase tracking-widest text-gray-900 transition-colors hover:bg-amber-300 disabled:opacity-40"
              >
                {submitting ? "Enviando..." : "Enviar solicitud"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
