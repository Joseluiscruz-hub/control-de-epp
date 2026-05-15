"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createKioskRequest, getPPECatalog, KioskRequestItem } from "@/lib/kiosk-api";
import { PPECatalogItem } from "@/lib/kiosk-types";
import { getStockStatus } from "@/lib/replacement-logic";
import { CheckCircle2, Loader2, Package, Search } from "lucide-react";
import { clearKioskSession } from "@/lib/kiosk-session";
import { useKioskInactivityTimeout } from "@/hooks/use-kiosk-inactivity-timeout";

const CATEGORY_ICONS: Record<string, string> = {
  Guantes: "🧤",
  Cascos: "⛑️",
  Gafas: "🥽",
  Calzado: "👢",
  "Proteccion Auditiva": "🎧",
  Ropa: "🦺",
  Respiradores: "😷",
  Otros: "📦",
};

const CATEGORIES = ["Todos", "Guantes", "Cascos", "Gafas", "Calzado", "Proteccion Auditiva", "Ropa", "Respiradores", "Otros"];

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
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [selectedByItem, setSelectedByItem] = useState<Record<string, SelectedVariant>>({});
  const [sizeByItem, setSizeByItem] = useState<Record<string, string>>({});

  const returnToLogin = () => {
    clearKioskSession();
    router.replace("/kiosko");
  };

  useKioskInactivityTimeout({
    timeoutMs: 2 * 60 * 1000,
    onTimeout: returnToLogin,
  });

  useEffect(() => {
    const id = sessionStorage.getItem("kiosk_employee_id");
    const verified = sessionStorage.getItem("kiosk_pin_verified");
    if (!id || verified !== "true") {
      router.replace("/kiosko");
      return;
    }

    setEmployeeId(id);
    setEmployeeName(sessionStorage.getItem("kiosk_employee_name") ?? "");

    getPPECatalog().then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, [router]);

  const getItemStock = (item: PPECatalogItem): number => {
    if (item.hasSizes && item.sizes) {
      return Object.values(item.sizes).reduce((acc, s) => acc + s.stock, 0);
    }
    return item.stock ?? 0;
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

    const sku = item.hasSizes ? item.sizes?.[size]?.sku : item.sku;
    if (!sku || !size) return;

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

  const submitRequest = async () => {
    const selectedItems = Object.values(selectedByItem);
    if (!employeeId || selectedItems.length === 0) return;

    setSubmitting(true);
    try {
      const requestId = await createKioskRequest({
        employeeId,
        employeeName,
        items: selectedItems as KioskRequestItem[],
      });
      sessionStorage.setItem("kiosk_request_id", requestId);
      router.push("/kiosko/espera");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-0 pb-32">
      <div className="px-6 pt-6 pb-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">Selecciona tu EPP</h2>
            <p className="text-sm text-gray-400">{employeeName} — Puedes elegir uno o varios</p>
          </div>
          <button
            onClick={returnToLogin}
            className="text-sm text-gray-400 hover:text-red-400 transition-colors border border-gray-700 rounded-lg px-3 py-2"
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
            className="w-full bg-gray-800 border border-gray-700 focus:border-amber-400 rounded-xl pl-11 pr-4 py-3 text-base text-white outline-none transition-colors placeholder:text-gray-600"
          />
        </div>

        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                category === cat ? "bg-amber-400 text-gray-900" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
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
                <div key={i} className="h-52 rounded-2xl bg-gray-800 animate-pulse" />
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
              const totalStock = getItemStock(item);
              const status = getStockStatus(totalStock, item.minStock ?? 5);
              const selected = !!selectedByItem[item.id];
              const selectedSize = sizeByItem[item.id];

              return (
                <div
                  key={item.id}
                  className={`relative flex flex-col gap-3 p-4 rounded-2xl border transition-all
                    ${
                      status === "empty"
                        ? "border-gray-700 bg-gray-800/40 opacity-50"
                        : selected
                        ? "border-amber-400 bg-amber-400/10"
                        : "border-gray-700 bg-gray-800"
                    }`}
                >
                  <span className="text-4xl">{CATEGORY_ICONS[item.category] ?? "📦"}</span>
                  <div>
                    <p className="font-semibold text-white text-base leading-tight">{item.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{item.category}</p>
                  </div>

                  {item.hasSizes && item.sizes && status !== "empty" && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(item.sizes)
                        .filter(([, variant]) => variant.stock > 0)
                        .map(([size]) => (
                          <button
                            key={size}
                            onClick={() => setSizeByItem((prev) => ({ ...prev, [item.id]: size }))}
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
                    className={`mt-auto w-full py-3 rounded-xl font-semibold transition-colors ${
                      selected
                        ? "bg-green-500/20 text-green-300 border border-green-500/40"
                        : "bg-amber-400 text-gray-900 hover:bg-amber-300 disabled:opacity-40"
                    }`}
                  >
                    {selected ? "✓ Seleccionado" : "Seleccionar"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur border-t border-gray-800 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <p className="text-sm text-gray-400">
            Seleccionados: <span className="text-white font-bold">{Object.keys(selectedByItem).length}</span>
          </p>
          <button
            onClick={submitRequest}
            disabled={submitting || Object.keys(selectedByItem).length === 0}
            className="px-8 py-4 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-gray-900 font-bold text-lg flex items-center gap-2"
          >
            {submitting ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            Solicitar
          </button>
        </div>
      </div>
    </div>
  );
}

