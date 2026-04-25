"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getPPECatalog } from "@/lib/kiosk-api";
import { PPECatalogItem } from "@/lib/kiosk-types";
import { getStockStatus } from "@/lib/replacement-logic";
import { HardHat, Search, Package, AlertTriangle, XCircle, ChevronRight } from "lucide-react";

const CATEGORY_ICONS: Record<string, string> = {
  "Guantes": "🧤", "Cascos": "⛑️", "Gafas": "🥽",
  "Calzado": "👢", "Proteccion Auditiva": "🎧",
  "Ropa": "🦺", "Respiradores": "😷", "Otros": "📦",
};

const CATEGORIES = ["Todos", "Guantes", "Cascos", "Gafas", "Calzado", "Proteccion Auditiva", "Ropa", "Respiradores", "Otros"];

export default function KioskoCatalogoPage() {
  const router = useRouter();
  const [items, setItems] = useState<PPECatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [employeeName, setEmployeeName] = useState("");

  useEffect(() => {
    const id = sessionStorage.getItem("kiosk_employee_id");
    const verified = sessionStorage.getItem("kiosk_pin_verified");
    if (!id || verified !== "true") { router.push("/kiosko"); return; }
    setEmployeeName(sessionStorage.getItem("kiosk_employee_name") ?? "");

    getPPECatalog().then(data => {
      setItems(data);
      setLoading(false);
    });

    // Sesión timeout 3 min
    const timer = setTimeout(() => {
      sessionStorage.clear();
      router.push("/kiosko");
    }, 3 * 60 * 1000);
    return () => clearTimeout(timer);
  }, []);

  const filtered = items.filter(item => {
    const matchCat = category === "Todos" || item.category === category;
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const getItemStock = (item: PPECatalogItem): number => {
    if (item.hasSizes && item.sizes) {
      return Object.values(item.sizes).reduce((acc, s) => acc + s.stock, 0);
    }
    return item.stock ?? 0;
  };

  const selectItem = (item: PPECatalogItem) => {
    sessionStorage.setItem("kiosk_selected_item", JSON.stringify(item));
    router.push("/kiosko/solicitud");
  };

  return (
    <div className="flex-1 flex flex-col gap-0">
      {/* Top bar */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Catálogo EPP</h2>
            <p className="text-sm text-gray-400">{employeeName} — Selecciona el equipo que necesitas</p>
          </div>
          <button
            onClick={() => { sessionStorage.clear(); router.push("/kiosko"); }}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors border border-gray-700 rounded-lg px-3 py-2"
          >
            Cerrar sesión
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar EPP..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 focus:border-amber-400 rounded-xl pl-11 pr-4 py-3 text-base text-white outline-none transition-colors placeholder:text-gray-600"
          />
        </div>

        {/* Category filter */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                category === cat
                  ? "bg-amber-400 text-gray-900"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {cat !== "Todos" && CATEGORY_ICONS[cat]} {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="h-44 rounded-2xl bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-gray-500">
            <Package size={48} />
            <p className="text-lg">Sin resultados para "{search}"</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {filtered.map(item => {
              const totalStock = getItemStock(item);
              const status = getStockStatus(totalStock, item.minStock ?? 5);
              return (
                <button
                  key={item.id}
                  onClick={() => status !== "empty" && selectItem(item)}
                  disabled={status === "empty"}
                  className={`relative flex flex-col gap-3 p-4 rounded-2xl border text-left transition-all active:scale-98
                    ${status === "empty"
                      ? "border-gray-700 bg-gray-800/40 opacity-50 cursor-not-allowed"
                      : "border-gray-700 bg-gray-800 hover:border-amber-400/60 hover:bg-gray-750"
                    }`}
                >
                  {/* Category emoji */}
                  <span className="text-4xl">{CATEGORY_ICONS[item.category] ?? "📦"}</span>

                  <div className="flex-1">
                    <p className="font-semibold text-white text-sm leading-tight">{item.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{item.category}</p>
                    <p className="text-xs text-gray-600 mt-1">Vida útil: {item.replacementDays} días</p>
                  </div>

                  {/* Stock badge */}
                  <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full self-start
                    ${status === "ok" ? "bg-green-900/40 text-green-400"
                    : status === "low" ? "bg-amber-900/40 text-amber-400"
                    : "bg-red-900/40 text-red-400"}`}
                  >
                    {status === "empty" ? <XCircle size={12} /> : status === "low" ? <AlertTriangle size={12} /> : null}
                    {status === "ok" ? `${totalStock} disp.`
                      : status === "low" ? `Solo ${totalStock}`
                      : "Sin stock"}
                  </div>

                  {status !== "empty" && (
                    <ChevronRight size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
